import type { Prisma } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import prisma from '../../config/prismaClient';
import uploadService from '../uploadService';
import { fetchRemoteAssetBuffer } from '../cloudinaryInlinePreviewService';
import { syncApplicationWorkflowFromContractEnvelopeStatus } from '../contractApplicationWorkflowSync';
import {
  isFillAtSigningTabRef,
  isOptionalSignerEditableTabRef,
} from '../docusign/utils/build-envelope-from-layout';
import { getPrefillDisplayLabel } from '../docusign/utils/prefill-layout-bridge';
import {
  PearSignApiError,
  createPearSignTemplate,
  getPearSignTemplate,
  isPearSignConfigured,
  sendPearSignEnvelope,
  type PearSignFieldType,
  type PearSignTemplate,
  type PearSignTemplateCreateInput,
} from './pearsign-client';
import {
  PearSignContractError,
  downloadPearSignContractPdf,
  isActivePearSignStatus,
  linkDocument,
  loadContract,
  readState,
  writeState,
  sendStatusNoticeOnce,
  type PearSignContractState,
} from './pearsign-contract.service';
import { notifyPearSignContractSent, pearSignShouldEmailSigners } from './pearsign-mail.service';
import { buildPearSignPreviewPdf, primeBasePdfCache } from './pearsign-preview.service';
import {
  cleanStyles,
  isPearSignIndependentKey,
  mergeStyles,
  pearSignHeightForFont,
  pearSignIndependentKey,
  pearSignIndependentLabel,
  type PearSignFieldStyle,
} from './pearsign-template-spec';

/**
 * ONE PearSign envelope for the whole package: main contract + addendums + state disclosure
 * (+ ACH addendum), in the same order and with the same values as the Dropbox Sign send.
 *
 * PearSign can only send an envelope from a single template, and a fixed template per
 * combination (11 states × daily/weekly × addendum mixes) is not workable, so:
 *
 *   1. stage   — `/docusign/merge-and-send` with signingProvider "pearsign" builds the package
 *                with the existing layout pipeline (buildPlatformLayoutEnvelopeDefinition — same
 *                PDFs, ordering, per-document scoping and CRM values as Dropbox Sign), then
 *                instead of opening Dropbox Sign this service merges the PDFs into one file and
 *                turns every tab into a positioned PearSign field. Nothing is sent.
 *   2. review  — the CRM Review modal shows the merged package with the values; edits are
 *                saved per document + variable.
 *   3. send    — a per-send PearSign template is created from the merged PDF + fields, one
 *                envelope is sent from it, and the template is deleted once the envelope is
 *                finished (verified: envelopes survive template deletion).
 *
 * The staged package lives on `Contract.contractPrefillOverrides.pearsignPackage`; the sent
 * envelope uses the same `pearsignMainContract` state as the contract-only flow, so status
 * sync, void, download, Document link and deal-stage moves all work unchanged.
 */

export const PEARSIGN_PACKAGE_KEY = 'pearsignPackage';

export type PackageFieldKind = 'text' | 'signature' | 'initials' | 'date';

export type PearSignPackageField = {
  /** PearSign field name (unique). */
  name: string;
  /** Review/value key: `d<doc>__<variable>` — one value fills every field of that variable in that document. */
  key: string;
  label: string;
  docIndex: number;
  type: PackageFieldKind;
  roleId: string;
  /** True when the signer completes it in PearSign (signature, initials, signing date, fill-at-signing text). */
  signerFilled: boolean;
  required: boolean;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PearSignPackageDocument = { index: number; name: string; layoutKey: string | null; startPage: number; pageCount: number };

export type PearSignStagedPackage = {
  stagedAt: string;
  stagedByUserId: string | null;
  funderProfileId: string | null;
  funderName: string | null;
  title: string;
  message: string;
  mergedPdfUrl: string;
  pageCount: number;
  documents: PearSignPackageDocument[];
  recipients: Array<{ roleId: string; roleName: string; name: string; email: string }>;
  ccEmails: string[];
  fields: PearSignPackageField[];
  /** CRM values per key, as the Dropbox Sign envelope would print them. */
  crmValues: Record<string, string>;
  /** Review edits per key. */
  overrides: Record<string, string>;
  /** Review font sizes per key (unset = PearSign auto-fit). */
  styles?: Record<string, PearSignFieldStyle>;
};

type Tab = Record<string, string | undefined>;
type Signer = {
  name?: string;
  email?: string;
  routingOrder?: string;
  tabs?: Partial<Record<'textTabs' | 'dateTabs' | 'signHereTabs' | 'initialHereTabs' | 'dateSignedTabs', Tab[]>>;
};
type EnvelopeDefinition = {
  emailSubject?: string;
  emailBlurb?: string;
  documents?: Array<{ documentId?: string; name?: string; documentBase64?: string }>;
  recipients?: { signers?: Signer[] };
};

const DEFAULT_SIZE: Record<PackageFieldKind, { width: number; height: number }> = {
  signature: { width: 130, height: 20 },
  initials: { width: 42, height: 12 },
  date: { width: 100, height: 16 },
  text: { width: 160, height: 16 },
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function variableOfTab(tab: Tab): string {
  return String(tab.tabLabel || tab.name || '').split('__')[0].trim();
}

function slug(s: string, max = 40): string {
  return String(s || '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max) || 'field';
}

/**
 * PearSign's signing page guesses a validation rule from each field's name/label
 * (e.g. "percent" → must be 0–100, "amount"/"loan"/"advance" → no negatives,
 * "creditscore" → 250–900, "birthdate" → past date) and blocks the signer. The API
 * has no switch for this, so the names we send avoid the trigger words.
 */
const PEARSIGN_VALIDATION_TRIGGERS: Array<[RegExp, string]> = [
  [/percentage/gi, 'pcntg'],
  [/percent/gi, 'pcnt'],
  [/ownership/gi, 'ownrshp'],
  [/amount/gi, 'amt'],
  [/funding/gi, 'fndng'],
  [/funded/gi, 'fndd'],
  [/loan/gi, 'ln'],
  [/advance/gi, 'advnc'],
  [/revenue/gi, 'rvn'],
  [/sales/gi, 'sls'],
  [/deposit/gi, 'dpst'],
  [/balance/gi, 'blnc'],
  [/price/gi, 'prc'],
  [/payoff/gi, 'pyff'],
  [/payment/gi, 'pymnt'],
  [/fico/gi, 'fc'],
  [/credit/gi, 'crdt'],
  [/birth/gi, 'brth'],
  [/\bdob\b/gi, 'd_o_b'],
  [/\bpct\b/gi, 'p_c_t'],
  [/year/gi, 'yr_'],
  [/\byr/gi, 'y_r'],
  [/established|founded|business_?start/gi, 'estd'],
];

export function pearSignNeutralFieldName(name: string): string {
  let out = String(name || '');
  for (const [re, rep] of PEARSIGN_VALIDATION_TRIGGERS) out = out.replace(re, rep);
  return out.replace(/_+/g, '_').slice(0, 64);
}

/** Original package field name → unique, validation-neutral name sent to PearSign. */
function pearSignSendNames(names: string[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const name of names) {
    const base = pearSignNeutralFieldName(name);
    let n = base;
    for (let i = 2; used.has(n); i++) n = `${base.slice(0, 60)}_${i}`;
    used.add(n);
    out.set(name, n);
  }
  return out;
}

// ---------- stage ----------

/**
 * Pure conversion (no I/O): merge the package PDFs and turn every envelope tab into a
 * positioned PearSign field. Exported for verification scripts/tests.
 */
export async function convertEnvelopeToPearSignPackage(envelopeDefinition: EnvelopeDefinition, layoutKeys?: string[]) {
  const env = envelopeDefinition || {};
  const docs = env.documents || [];
  if (!docs.length) throw new PearSignContractError('The package has no documents.');

  // 1. Merge the PDFs in envelope order (disclosure / contract / addendums, as built).
  const merged = await PDFDocument.create();
  const documents: PearSignPackageDocument[] = [];
  const pageOffsetByDocId = new Map<string, { offset: number; count: number; index: number }>();
  for (const [index, d] of docs.entries()) {
    let src: PDFDocument;
    try {
      src = await PDFDocument.load(Buffer.from(String(d.documentBase64 || ''), 'base64'), { ignoreEncryption: true });
    } catch {
      throw new PearSignContractError(`Document "${d.name || index + 1}" in the package could not be read.`, 502);
    }
    const offset = merged.getPageCount();
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
    const docId = String(d.documentId || index + 1);
    pageOffsetByDocId.set(docId, { offset, count: pages.length, index });
    documents.push({
      index,
      name: String(d.name || `Document ${index + 1}`),
      layoutKey: layoutKeys?.[index] ?? null,
      startPage: offset + 1,
      pageCount: pages.length,
    });
  }
  const mergedBytes = Buffer.from(await merged.save());
  const pageWidth = new Map<number, number>();
  merged.getPages().forEach((p, i) => pageWidth.set(i + 1, p.getWidth()));

  // 2. Recipients, in routing order → PearSign roles signer-1, signer-2 …
  const signers = (env.recipients?.signers || [])
    .filter((s) => String(s.email || '').trim())
    .map((s, i) => ({ s, order: Number(s.routingOrder) > 0 ? Number(s.routingOrder) : i + 1 }))
    .sort((a, b) => a.order - b.order);
  if (!signers.length) throw new PearSignContractError('Add signer emails in Contract Signers before preparing the package.');
  const recipients = signers.map(({ s }, i) => ({
    roleId: `signer-${i + 1}`,
    roleName: i === 0 ? 'Owner 1' : `Owner ${i + 1}`,
    name: String(s.name || '').trim(),
    email: String(s.email || '').trim().toLowerCase(),
  }));

  // 3. Every tab → positioned field (same conversion rules as the Dropbox Sign bridge).
  const fields: PearSignPackageField[] = [];
  const crmValues: Record<string, string> = {};
  const used = new Set<string>();
  const uniqueName = (base: string) => {
    let name = base.slice(0, 64);
    for (let n = 2; used.has(name); n++) name = `${base.slice(0, 60)}_${n}`;
    used.add(name);
    return name;
  };

  signers.forEach(({ s }, signerIdx) => {
    const roleId = recipients[signerIdx].roleId;
    const tabs = s.tabs || {};
    const buckets: Array<[Tab[] | undefined, 'signature' | 'initials' | 'date' | 'text']> = [
      [tabs.signHereTabs, 'signature'],
      [tabs.initialHereTabs, 'initials'],
      [tabs.dateSignedTabs, 'date'],
      [tabs.textTabs, 'text'],
      [tabs.dateTabs, 'text'],
    ];
    for (const [list, base] of buckets) {
      for (const tab of list || []) {
        const loc = pageOffsetByDocId.get(String(tab.documentId || '1'));
        const page = num(tab.pageNumber);
        const x = num(tab.xPosition);
        const y = num(tab.yPosition);
        if (!loc || !(page >= 1) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
        const mergedPage = loc.offset + page;
        const variable = variableOfTab(tab) || base;
        const value = String(tab.value ?? '').trim();

        let type: PackageFieldKind = base;
        let signerFilled = base !== 'text';
        let required = base === 'signature' || base === 'initials';
        if (base === 'text') {
          if (value) {
            signerFilled = false; // CRM value, editable in Review
          } else if (/signature_date|date_signed/i.test(variable)) {
            type = 'date';
            signerFilled = true;
          } else if (isFillAtSigningTabRef(tab)) {
            signerFilled = true;
            required = !isOptionalSignerEditableTabRef(tab);
          } else {
            signerFilled = false; // blank CRM field — can be filled in Review
          }
        }

        const size = DEFAULT_SIZE[type];
        let width = num(tab.width) > 0 ? num(tab.width) : size.width;
        const height = num(tab.height) > 0 ? num(tab.height) : size.height;
        if (!signerFilled && value) {
          // Auto-width tabs (state disclosures) size to the value; never past the page edge.
          const needed = value.length * 5.4 + 8;
          const maxW = Math.max(40, (pageWidth.get(mergedPage) ?? 612) - 12 - x);
          width = Math.min(Math.max(width, needed), maxW);
        }

        // Independent fields (page-1 EIN) get their own key so edits don't reach the other pages.
        const ownKey = signerFilled ? null : pearSignIndependentKey(variable, page);
        const key = `d${loc.index + 1}__${ownKey ?? variable}`;
        if (!signerFilled && value && crmValues[key] === undefined) crmValues[key] = value;
        fields.push({
          name: uniqueName(`d${loc.index + 1}_${slug(variable)}_p${mergedPage}`),
          key,
          label: ownKey ? pearSignIndependentLabel(getPrefillDisplayLabel(variable), page) : getPrefillDisplayLabel(variable),
          docIndex: loc.index,
          type,
          roleId,
          signerFilled,
          required,
          page: mergedPage,
          x: Math.max(0, Math.round(x)),
          y: Math.max(0, Math.round(y)),
          width: Math.round(width),
          height: Math.round(height),
        });
      }
    }
  });
  if (!fields.some((f) => f.type === 'signature' || f.type === 'initials')) {
    throw new PearSignContractError('No signature placements found in the package; cannot send via PearSign.');
  }

  return { env, mergedBytes, pageCount: merged.getPageCount(), documents, recipients, fields, crmValues };
}


export async function stagePearSignPackage(input: {
  envelopeDefinition: EnvelopeDefinition;
  layoutKeys?: string[];
  contractId?: number;
  applicationId?: string;
  funderProfileId?: string | null;
  funderName?: string | null;
  ccEmails?: string[];
  actorUserId?: string | number | null;
}) {
  if (!isPearSignConfigured()) throw new PearSignContractError('PEARSIGN_API_KEY is not configured on the server.', 500);
  const contractId = Number(input.contractId);
  if (!Number.isFinite(contractId) || contractId <= 0) {
    throw new PearSignContractError('Save the contract before preparing a PearSign package.');
  }
  const contract = await loadContract(contractId);
  const state = readState(contract.contractPrefillOverrides);
  if (state?.envelopeId && isActivePearSignStatus(state.status)) {
    throw new PearSignContractError(
      'A PearSign envelope is already out for signature for this contract. Void it first to send a new one.',
      409,
    );
  }

  const { env, mergedBytes, pageCount, documents, recipients, fields, crmValues } = await convertEnvelopeToPearSignPackage(
    input.envelopeDefinition,
    input.layoutKeys,
  );

  // 4. Keep the merged PDF (PearSign template source + preview base).
  const up = await uploadService.uploadBuffer(mergedBytes, 'ih-crm/pearsign-packages', `package_${contractId}_${Date.now()}.pdf`, {
    forcePdf: true,
  });
  if (!up.success || !up.data?.secure_url) {
    throw new PearSignContractError('Could not store the merged package PDF.', 502);
  }
  // The Review preview draws on this exact PDF — serve it from memory, not Cloudinary.
  primeBasePdfCache(up.data.secure_url, mergedBytes);

  const prevPackage = readPackage(contract.contractPrefillOverrides);
  const staged: PearSignStagedPackage = {
    stagedAt: new Date().toISOString(),
    stagedByUserId: input.actorUserId == null ? null : String(input.actorUserId),
    funderProfileId: input.funderProfileId ?? null,
    funderName: input.funderName ?? contract.funderName ?? null,
    title: String(env.emailSubject || 'Contract').slice(0, 200),
    message: String(env.emailBlurb || ''),
    mergedPdfUrl: up.data.secure_url,
    pageCount,
    documents,
    recipients,
    ccEmails: [...new Set((input.ccEmails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))],
    fields,
    crmValues,
    // Keep Review edits for keys that still exist (re-staging after a CRM change).
    overrides: Object.fromEntries(
      Object.entries(prevPackage?.overrides ?? {}).filter(([k]) => fields.some((f) => f.key === k)),
    ),
    styles: Object.fromEntries(
      Object.entries(cleanStyles(prevPackage?.styles)).filter(([k]) => fields.some((f) => f.key === k)),
    ),
  };
  await writePackage(contractId, staged);
  console.info('[PearSign] package staged', {
    contractId,
    documents: documents.map((d) => `${d.name} (${d.pageCount}p)`),
    fields: fields.length,
    crmFilled: fields.filter((f) => !f.signerFilled && crmValues[f.key]).length,
    recipients: recipients.length,
  });

  return {
    success: true,
    provider: 'pearsign',
    packageStaged: true,
    envelopeId: '',
    documentId: '',
    sendUrl: null,
    message: 'PearSign package prepared. Review it in the CRM and send.',
    data: { provider: 'pearsign', documents: documents.length, fields: fields.length },
  };
}

// ---------- storage ----------

export function readPackage(overrides: unknown): PearSignStagedPackage | null {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return null;
  const raw = (overrides as Record<string, unknown>)[PEARSIGN_PACKAGE_KEY];
  return raw && typeof raw === 'object' ? (raw as PearSignStagedPackage) : null;
}

async function writePackage(contractId: number, pkg: PearSignStagedPackage) {
  await prisma.$transaction(async (tx) => {
    const row = await tx.contract.findUnique({ where: { id: contractId }, select: { contractPrefillOverrides: true } });
    const base =
      row?.contractPrefillOverrides && typeof row.contractPrefillOverrides === 'object' && !Array.isArray(row.contractPrefillOverrides)
        ? (row.contractPrefillOverrides as Record<string, unknown>)
        : {};
    await tx.contract.update({
      where: { id: contractId },
      data: { contractPrefillOverrides: { ...base, [PEARSIGN_PACKAGE_KEY]: pkg } as Prisma.InputJsonValue },
    });
   }, { timeout: 30_000, maxWait: 10_000 }); // large package JSON over Neon
}

async function requirePackage(contractId: number) {
  const contract = await loadContract(contractId);
  const pkg = readPackage(contract.contractPrefillOverrides);
  if (!pkg) throw new PearSignContractError('No PearSign package is prepared for this contract. Click "Review & send in PearSign" again.', 404);
  return { contract, pkg, state: readState(contract.contractPrefillOverrides) };
}

function packageValues(pkg: PearSignStagedPackage, extra?: Record<string, string>): Record<string, string> {
  const out = { ...pkg.crmValues, ...pkg.overrides };
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (String(v).trim() || isPearSignIndependentKey(k)) out[k] = String(v);
    else out[k] = pkg.crmValues[k] ?? '';
  }
  return out;
}

/** What the renderer needs from a package (staged or as stored on the sent state). */
type DrawablePackage = {
  mergedPdfUrl: string;
  fields: Array<Pick<PearSignPackageField, 'name' | 'key' | 'roleId' | 'signerFilled' | 'required' | 'page' | 'x' | 'y' | 'width' | 'height'> & { type: string }>;
  recipients: Array<{ roleId: string; roleName: string }>;
  styles?: Record<string, PearSignFieldStyle>;
};

/** The package as a PearSign-template-shaped object (for the shared preview renderer). */
function asTemplate(pkg: DrawablePackage): PearSignTemplate {
  return {
    id: 'package',
    name: 'package',
    status: 'active',
    signerRoles: pkg.recipients.map((r, i) => ({ roleId: r.roleId, name: r.roleName, order: i + 1 })),
    fields: pkg.fields.map((f) => ({
      fieldId: f.name,
      fieldName: f.name,
      type: f.type,
      required: f.required,
      roleId: f.roleId,
      position: { page: f.page, x: f.x, y: f.y, width: f.width, height: f.height },
    })),
  };
}

export async function drawPearSignPackage(
  pkg: DrawablePackage,
  values: Record<string, string>,
  title: string,
) {
  const keyByName = new Map(pkg.fields.map((f) => [f.name, f.key]));
  return buildPearSignPreviewPdf({
    template: asTemplate(pkg),
    sourcePdfUrl: pkg.mergedPdfUrl,
    values,
    signerFilledNames: new Set(pkg.fields.filter((f) => f.signerFilled).map((f) => f.name)),
    valueKeyFor: (name) => keyByName.get(name) ?? name,
    styles: cleanStyles(pkg.styles),
    title,
  });
}

// ---------- review ----------

export async function getPearSignPackageReview(contractId: number) {
  const { contract, pkg, state } = await requirePackage(contractId);
  const values = packageValues(pkg);
  const docName = new Map(pkg.documents.map((d) => [d.index, d.name]));

  const fieldsByKey = new Map<string, { key: string; label: string; pages: number[]; document: string; docIndex: number }>();
  const fieldLayout: Array<{ key: string; page: number; x: number; y: number; width: number; height: number }> = [];
  const signerBoxes: Array<{ kind: string; roleName: string; page: number; x: number; y: number; width: number; height: number }> = [];
  const roleName = new Map(pkg.recipients.map((r) => [r.roleId, r.roleName]));
  for (const f of pkg.fields) {
    const box = { page: f.page, x: f.x, y: f.y, width: f.width, height: f.height };
    if (f.signerFilled) {
      signerBoxes.push({
        kind: f.type === 'signature' ? 'Sign' : f.type === 'initials' ? 'Initial' : f.type === 'date' ? 'Date' : 'Signer completes',
        roleName: roleName.get(f.roleId) ?? '',
        ...box,
      });
      continue;
    }
    fieldLayout.push({ key: f.key, ...box });
    const cur = fieldsByKey.get(f.key) ?? { key: f.key, label: f.label, pages: [], document: docName.get(f.docIndex) ?? '', docIndex: f.docIndex };
    if (!cur.pages.includes(f.page)) cur.pages.push(f.page);
    fieldsByKey.set(f.key, cur);
  }
  const fields = [...fieldsByKey.values()].sort((a, b) => a.docIndex - b.docIndex || Math.min(...a.pages) - Math.min(...b.pages));

  const blockers: string[] = [];
  for (const r of pkg.recipients) {
    if (!r.name) blockers.push(`${r.roleName} has no name in Contract Signers.`);
  }
  if (new Set(pkg.recipients.map((r) => r.email)).size !== pkg.recipients.length) {
    blockers.push('Each owner needs a different email address.');
  }
  if (state?.envelopeId && isActivePearSignStatus(state.status)) {
    blockers.push('A PearSign envelope is already out for signature for this contract. Void it first to send a new one.');
  }

  return {
    mode: 'package' as const,
    funderProfileId: pkg.funderProfileId,
    funderName: pkg.funderName ?? contract.funderName,
    templateId: '',
    templateName: pkg.title,
    ownerCount: pkg.recipients.length,
    signerRoles: pkg.recipients.map((r, i) => ({ roleId: r.roleId, name: r.roleName, order: i + 1 })),
    documents: pkg.documents,
    fields,
    fieldLayout,
    signerBoxes,
    crmValues: pkg.crmValues,
    overrides: pkg.overrides,
    values,
    blankKeys: fields.filter((f) => !String(values[f.key] ?? '').trim()).map((f) => f.key),
    keepBlankKeys: fields.filter((f) => isPearSignIndependentKey(f.key)).map((f) => f.key),
    styles: cleanStyles(pkg.styles),
    recipients: pkg.recipients,
    blockers,
    warnings: [] as string[],
    stagedAt: pkg.stagedAt,
    state,
  };
}

export async function savePearSignPackageOverrides(contractId: number, body: { overrides?: unknown; styles?: unknown }) {
  const { pkg, state } = await requirePackage(contractId);
  if (state?.envelopeId && isActivePearSignStatus(state.status)) {
    throw new PearSignContractError('This contract is out for signature in PearSign; void it before editing values.', 409);
  }
  const keys = new Set(pkg.fields.map((f) => f.key));
  const next = { ...pkg.overrides };
  for (const [k, v] of Object.entries((body.overrides && typeof body.overrides === 'object' ? body.overrides : {}) as Record<string, unknown>)) {
    if (!keys.has(k)) continue;
    const value = v === null || v === undefined ? '' : String(v).slice(0, 2000);
    if (value.trim() || isPearSignIndependentKey(k)) next[k] = value;
    else delete next[k];
  }
  const textKeys = new Set(pkg.fields.filter((f) => !f.signerFilled).map((f) => f.key));
  const styles = mergeStyles(cleanStyles(pkg.styles), body.styles, (k) => textKeys.has(k));
  await writePackage(contractId, { ...pkg, overrides: next, styles });
  return { overrides: next, styles };
}

export async function buildPearSignPackagePreview(contractId: number, body: { values?: unknown; drawValues?: boolean }) {
  const { pkg } = await requirePackage(contractId);
  const extra =
    body.values && typeof body.values === 'object'
      ? Object.fromEntries(Object.entries(body.values as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]))
      : undefined;
  const values = body.drawValues === false ? {} : packageValues(pkg, extra);
  const { pdf, filledFieldCount } = await drawPearSignPackage(pkg, values, `${pkg.title} (preview)`);
  const fileName = `${slug(pkg.title, 80)}_preview.pdf`;
  return { pdf, filledFieldCount, fileName };
}

// ---------- send ----------

export async function sendPearSignPackage(contractId: number, actorUserId: string | null, body: { message?: string } = {}) {
  const { contract, pkg, state } = await requirePackage(contractId);
  if (!contract.applicationId) throw new PearSignContractError('Contract has no application.');
  if (state?.envelopeId && isActivePearSignStatus(state.status)) {
    throw new PearSignContractError('This contract already has a PearSign envelope out for signature. Void it first.', 409);
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const r of pkg.recipients) {
    if (!r.name || !emailRe.test(r.email)) throw new PearSignContractError(`Enter a name and valid email for ${r.roleName}.`);
  }

  const values = packageValues(pkg);
  const sendName = pearSignSendNames(pkg.fields.map((f) => f.name));
  const fieldValues: Record<string, string> = {};
  let blank = 0;
  for (const f of pkg.fields) {
    if (f.signerFilled) continue;
    const v = String(values[f.key] ?? '').trim();
    if (v) fieldValues[sendName.get(f.name)!] = v;
    else blank++;
  }

  // Per-send template from the merged package.
  let pdf: Buffer;
  try {
    pdf = await fetchRemoteAssetBuffer(pkg.mergedPdfUrl);
  } catch (err) {
    throw new PearSignContractError(`Could not load the package PDF: ${(err as Error)?.message}`, 502);
  }
  const styles = cleanStyles(pkg.styles);
  const createFields: PearSignTemplateCreateInput['fields'] = pkg.fields.map((f) => {
    const fontSize = f.signerFilled ? undefined : styles[f.key]?.fontSize;
    return {
      fieldName: sendName.get(f.name)!,
      type: f.type as PearSignFieldType,
      required: f.required,
      roleId: f.roleId,
      position: { page: f.page, x: f.x, y: f.y, width: f.width, height: pearSignHeightForFont(f.height, fontSize) },
      ...(fontSize ? { fontSize } : {}),
    };
  });
  let template: PearSignTemplate;
  try {
    template = await createPearSignTemplate({
      name: `CRM package — ${pkg.title} — contract ${contractId} — ${new Date().toISOString().slice(0, 16)}`.slice(0, 200),
      description: 'Per-send template generated by the Cashable CRM (contract + addendums + disclosure). Deleted after signing.',
      category: 'crm-package',
      status: 'active',
      signerRoles: pkg.recipients.map((r, i) => ({ roleId: r.roleId, name: r.roleName, order: i + 1 })),
      fields: createFields,
      documentBase64: pdf.toString('base64'),
    });
  } catch (e) {
    if (e instanceof PearSignApiError) throw new PearSignContractError(e.message, e.status >= 500 ? 502 : 400);
    throw e;
  }
  const live = await getPearSignTemplate(template.id);
  if ((live.fields?.length ?? 0) !== createFields.length) {
    throw new PearSignContractError(
      `PearSign stored ${live.fields?.length ?? 0} of ${createFields.length} fields for the package template ${template.id}; not sending.`,
      502,
    );
  }

  const message =
    String(body.message || '').trim().slice(0, 2000) ||
    pkg.message ||
    `Please review and sign your ${pkg.funderName || 'funding'} agreement.`;
  // The CRM emails the signing invites from Gmail; PearSign only does when PEARSIGN_SIGNER_INVITES=pearsign.
  const sendEmail = pearSignShouldEmailSigners();
  let result;
  try {
    result = await sendPearSignEnvelope({
      templateId: template.id,
      recipients: pkg.recipients.map((r) => ({ roleId: r.roleId, name: r.name, email: r.email })),
      fieldValues,
      options: { title: pkg.title, message, expirationDays: 30, sendEmail },
    });
  } catch (e) {
    if (e instanceof PearSignApiError) throw new PearSignContractError(e.message, e.status >= 500 ? 502 : 400);
    throw e;
  }
  console.info('[PearSign] package sent', {
    contractId,
    envelopeId: result.envelopeId,
    templateId: template.id,
    documents: pkg.documents.length,
    prefilled: Object.keys(fieldValues).length,
    blank,
  });

  const sentAt = new Date();
  const next: PearSignContractState = {
    templateId: template.id,
    ephemeralTemplate: true,
    templateDeletedAt: null,
    funderProfileId: pkg.funderProfileId ?? undefined,
    ownerCount: pkg.recipients.length,
    values,
    recipients: pkg.recipients,
    envelopeId: result.envelopeId,
    status: result.status || 'sent',
    sentAt: sentAt.toISOString(),
    completedAt: null,
    customerSignedAt: null,
    signedPdfUrl: null,
    lastSyncedAt: sentAt.toISOString(),
    sentByUserId: actorUserId,
    ccEmails: pkg.ccEmails,
    crmCcMail: true,
    title: pkg.title,
    package: { mergedPdfUrl: pkg.mergedPdfUrl, fields: pkg.fields, recipients: pkg.recipients, documents: pkg.documents, styles },
    history: [
      ...(state?.history ?? []),
      ...(state?.envelopeId ? [{ envelopeId: state.envelopeId, status: state.status ?? '', sentAt: state.sentAt }] : []),
    ].slice(-20),
  };
  await writeState(contractId, next, { status: 'SENT' });
  // Notifications inbox: "Contract Sent" (in-app only; the team is emailed from Viewed on).
  if (contract.applicationId) {
    await sendStatusNoticeOnce(contractId, contract.applicationId, contract.funderName ?? null, next, null).catch((err) =>
      console.error('[PearSign] sent notification failed', err),
    );
  }
  await linkDocument(contract.applicationId, actorUserId, result.envelopeId, sentAt);
  await syncApplicationWorkflowFromContractEnvelopeStatus(prisma, contract.applicationId, 'SENT', {
    source: 'pearsign_package_send',
    contractId,
    contractStatusPrevious: String(contract.status),
    contractStatusNew: 'SENT',
  }).catch((err) => console.warn('[PearSign] workflow sync after package send failed', err?.message));

  // "Contract Sent" copy (filled package PDF) to every CC; logs PearSign's invites too.
  const ccMail = await notifyPearSignContractSent({
    contractId,
    applicationId: contract.applicationId,
    envelopeId: result.envelopeId,
    title: pkg.title,
    funderName: pkg.funderName ?? contract.funderName,
    values,
    signers: pkg.recipients.map((r) => ({ email: r.email, name: r.name, roleName: r.roleName })),
    ccEmails: pkg.ccEmails ?? [],
    pearSignEmailedSigners: sendEmail && result.emailSent !== false,
    signingUrls: result.signingUrls ?? [],
    message,
    loadPdf: async () => (await downloadPearSignContractPdf(contractId, 'latest')).pdf,
  });

  return {
    state: next,
    prefilledFieldCount: result.prefilledFieldCount ?? Object.keys(fieldValues).length,
    blankFieldCount: blank,
    emailSent: sendEmail ? result.emailSent !== false : ccMail.invites.emailed.length > 0,
    invitesFailed: ccMail.invites.failed,
    documents: pkg.documents.map((d) => d.name),
    ccMail,
  };
}
