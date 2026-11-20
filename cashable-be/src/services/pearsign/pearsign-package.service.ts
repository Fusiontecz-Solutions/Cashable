import type { Prisma } from '@prisma/client';
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
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
  createPearSignEditorSession,
  createPearSignTemplate,
  deletePearSignTemplate,
  getPearSignEditorSession,
  getPearSignTemplate,
  isPearSignConfigured,
  sendPearSignEnvelope,
  type PearSignEditorField,
  type PearSignFieldType,
  type PearSignSendResult,
  type PearSignTemplate,
  type PearSignTemplateCreateInput,
} from './pearsign-client';
import {
  PearSignContractError,
  downloadPearSignContractPdf,
  isActivePearSignStatus,
  linkDocument,
  loadContract,
  pearSignSendError,
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
  pearSignBoxForFont,
  pearSignPageFontSizes,
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
  const measureFont = await measureHelvetica();
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
        if (!signerFilled && value && !(num(tab.width) > 0)) {
          // Auto-width tabs (state disclosures, no width of their own) size to the value; never
          // past the page edge. Tabs with a width (layout blanks) keep it, so a long value never
          // spreads over the printed words after the blank.
          // Room for the value at the standard 10pt (measured with the real font, not a guess).
          const needed = measureFont.widthOfTextAtSize(value, 10) + 8;
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

let helveticaForMeasure: Promise<PDFFont> | null = null;
function measureHelvetica(): Promise<PDFFont> {
  helveticaForMeasure ??= PDFDocument.create().then((d) => d.embedFont(StandardFonts.Helvetica));
  return helveticaForMeasure;
}

/**
 * Value size per field key for this package: a size chosen in Review wins; otherwise the
 * one size per page (pearSignPageFontSizes). A key used by several boxes takes the
 * smallest so the value fits in every one.
 */
async function effectiveFieldStyles(
  pkg: Pick<DrawablePackage, 'fields' | 'styles'>,
  values: Record<string, string>,
): Promise<Record<string, PearSignFieldStyle>> {
  const font = await measureHelvetica();
  const measure = (t: string, s: number) => font.widthOfTextAtSize(t, s);
  const chosen = cleanStyles(pkg.styles);
  const filled = pkg.fields.filter((f) => !(f.signerFilled || f.type === 'signature' || f.type === 'initials'));
  // One size per page (pearSignPageFontSizes); a size chosen in Review wins for that field.
  const sizes = pearSignPageFontSizes(
    filled.map((f) => ({ page: f.page, width: f.width, value: String(values[f.key] ?? '') })),
    measure,
  );
  const out: Record<string, PearSignFieldStyle> = {};
  filled.forEach((f, i) => {
    if (chosen[f.key]?.fontSize) {
      out[f.key] = chosen[f.key];
      return;
    }
    out[f.key] = { fontSize: Math.min(out[f.key]?.fontSize ?? sizes[i], sizes[i]) };
  });
  return out;
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
    styles: await effectiveFieldStyles(pkg, values),
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
    /** Size each field is drawn and sent at (one size per page; Review choices included). */
    appliedStyles: await effectiveFieldStyles(pkg, values),
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

type PreparedPackageSend = Awaited<ReturnType<typeof preparePackageSend>>;

/** Everything a send needs, checked: values, the merged PDF and the PearSign fields. */
async function preparePackageSend(contractId: number, body: { message?: string }) {
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

  let pdf: Buffer;
  try {
    pdf = await fetchRemoteAssetBuffer(pkg.mergedPdfUrl);
  } catch (err) {
    throw new PearSignContractError(`Could not load the package PDF: ${(err as Error)?.message}`, 502);
  }
  // Every CRM-filled box gets an explicit size + Helvetica (consistent across the package),
  // instead of PearSign's per-box auto-fit; a size chosen in Review wins.
  const styles = await effectiveFieldStyles(pkg, values);
  const sentStyles = cleanStyles(pkg.styles);
  const createFields: PearSignTemplateCreateInput['fields'] = pkg.fields.map((f) => {
    const fontSize = f.signerFilled ? undefined : styles[f.key]?.fontSize;
    return {
      fieldName: sendName.get(f.name)!,
      type: f.type as PearSignFieldType,
      required: f.required,
      roleId: f.roleId,
      // Box grown evenly to the size so the value stays centred on its line.
      position: (({ y, height }) => ({ page: f.page, x: f.x, y: Math.round(y * 10) / 10, width: f.width, height }))(
        pearSignBoxForFont({ y: f.y, height: f.height }, fontSize),
      ),
      ...(fontSize ? { fontSize, fontFamily: 'helvetica' as const } : {}),
    };
  });
  const signerRoles = pkg.recipients.map((r, i) => ({ roleId: r.roleId, name: r.roleName, order: i + 1 }));
  const message =
    String(body.message || '').trim().slice(0, 2000) ||
    pkg.message ||
    `Please review and sign your ${pkg.funderName || 'funding'} agreement.`;
  return { contract, pkg, state, values, sendName, fieldValues, blank, pdf, sentStyles, createFields, signerRoles, message };
}

/** After PearSign has the envelope: save the state, link the Document, notify, move the deal. */
async function recordPackageSent(
  contractId: number,
  actorUserId: string | null,
  prep: Pick<PreparedPackageSend, 'contract' | 'pkg' | 'state' | 'message'>,
  sent: {
    envelopeId: string;
    templateId: string | null;
    status?: string | null;
    values: Record<string, string>;
    /** The package as sent (fields where they ended up), for the CRM-drawn PDF; null = PearSign's PDF. */
    sentPackage: PearSignContractState['package'] | null;
    pearSignEmailedSigners: boolean;
    signingUrls: NonNullable<PearSignSendResult['signingUrls']>;
    source: string;
  },
) {
  const { contract, pkg, state, message } = prep;
  const applicationId = contract.applicationId!;
  const sentAt = new Date();
  const next: PearSignContractState = {
    templateId: sent.templateId ?? undefined,
    ephemeralTemplate: Boolean(sent.templateId),
    templateDeletedAt: null,
    funderProfileId: pkg.funderProfileId ?? undefined,
    ownerCount: pkg.recipients.length,
    values: sent.values,
    recipients: pkg.recipients,
    envelopeId: sent.envelopeId,
    status: sent.status || 'sent',
    sentAt: sentAt.toISOString(),
    completedAt: null,
    customerSignedAt: null,
    signedPdfUrl: null,
    lastSyncedAt: sentAt.toISOString(),
    sentByUserId: actorUserId,
    ccEmails: pkg.ccEmails,
    crmCcMail: true,
    title: pkg.title,
    ...(sent.sentPackage ? { package: sent.sentPackage } : {}),
    history: [
      ...(state?.history ?? []),
      ...(state?.envelopeId ? [{ envelopeId: state.envelopeId, status: state.status ?? '', sentAt: state.sentAt }] : []),
    ].slice(-20),
  };
  await writeState(contractId, next, { status: 'SENT' });
  // Notifications inbox: "Contract Sent" (in-app only; the team is emailed from Viewed on).
  await sendStatusNoticeOnce(contractId, applicationId, contract.funderName ?? null, next, null).catch((err) =>
    console.error('[PearSign] sent notification failed', err),
  );
  await linkDocument(applicationId, actorUserId, sent.envelopeId, sentAt);
  await syncApplicationWorkflowFromContractEnvelopeStatus(prisma, applicationId, 'SENT', {
    source: sent.source,
    contractId,
    contractStatusPrevious: String(contract.status),
    contractStatusNew: 'SENT',
  }).catch((err) => console.warn('[PearSign] workflow sync after package send failed', err?.message));

  // "Contract Sent" copy (filled package PDF) to every CC; logs PearSign's invites too.
  const ccMail = await notifyPearSignContractSent({
    contractId,
    applicationId,
    envelopeId: sent.envelopeId,
    title: pkg.title,
    funderName: pkg.funderName ?? contract.funderName,
    values: sent.values,
    signers: pkg.recipients.map((r) => ({ email: r.email, name: r.name, roleName: r.roleName })),
    ccEmails: pkg.ccEmails ?? [],
    pearSignEmailedSigners: sent.pearSignEmailedSigners,
    signingUrls: sent.signingUrls,
    message,
    loadPdf: async () => (await downloadPearSignContractPdf(contractId, 'latest')).pdf,
  });
  return { next, ccMail };
}

export async function sendPearSignPackage(
  contractId: number,
  actorUserId: string | null,
  body: { message?: string; allowRepeat?: unknown } = {},
) {
  const prep = await preparePackageSend(contractId, body);
  const { pkg, values, fieldValues, blank, pdf, sentStyles, createFields, signerRoles, message } = prep;

  // Per-send template from the merged package.
  let template: PearSignTemplate;
  try {
    template = await createPearSignTemplate({
      name: `CRM package — ${pkg.title} — contract ${contractId} — ${new Date().toISOString().slice(0, 16)}`.slice(0, 200),
      description: 'Per-send template generated by the Cashable CRM (contract + addendums + disclosure). Deleted after signing.',
      category: 'crm-package',
      status: 'active',
      signerRoles,
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

  // The CRM emails the signing invites from Gmail; PearSign only does when PEARSIGN_SIGNER_INVITES=pearsign.
  const sendEmail = pearSignShouldEmailSigners();
  let result;
  try {
    result = await sendPearSignEnvelope({
      templateId: template.id,
      recipients: pkg.recipients.map((r) => ({ roleId: r.roleId, name: r.name, email: r.email })),
      fieldValues,
      options: { title: pkg.title, message, expirationDays: 30, sendEmail, ...(body.allowRepeat === true ? { allowRepeat: true } : {}) },
    });
  } catch (e) {
    // Nothing was sent: drop the per-send template.
    await deletePearSignTemplate(template.id).catch(() => undefined);
    if (e instanceof PearSignApiError) throw pearSignSendError(e);
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

  const { next, ccMail } = await recordPackageSent(contractId, actorUserId, prep, {
    envelopeId: result.envelopeId,
    templateId: template.id,
    status: result.status,
    values,
    sentPackage: { mergedPdfUrl: pkg.mergedPdfUrl, fields: pkg.fields, recipients: pkg.recipients, documents: pkg.documents, styles: sentStyles },
    pearSignEmailedSigners: sendEmail && result.emailSent !== false,
    signingUrls: result.signingUrls ?? [],
    source: 'pearsign_package_send',
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

// ---------- embedded PearSign editor ----------

/** Open editor session per contract (outside the package, so a package write never clears it). */
const EDITOR_SESSION_KEY = 'pearsignEditorSession';

type EditorSessionRecord = { sessionId: string; createdAt: string; createdByUserId: string | null; message: string };

/** An origin PearSign will let frame the editor: https, or http on localhost. */
export function editorOrigin(raw: unknown): string {
  const value = String(raw ?? '').trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PearSignContractError('Could not tell which CRM address is opening the editor. Reload the page and try again.');
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new PearSignContractError('The PearSign editor only opens on an https CRM address.');
  }
  return url.origin;
}

async function writeEditorSession(contractId: number, record: EditorSessionRecord | null) {
  const value = JSON.stringify(record);
  await prisma.$executeRaw`
    UPDATE "Contract"
    SET "contractPrefillOverrides" = jsonb_set(coalesce("contractPrefillOverrides", '{}'::jsonb), ARRAY[${EDITOR_SESSION_KEY}]::text[], ${value}::jsonb, true)
    WHERE id = ${contractId}
  `;
}

function readEditorSession(overrides: unknown): EditorSessionRecord | null {
  const raw = (overrides as Record<string, unknown> | null | undefined)?.[EDITOR_SESSION_KEY] as
    | EditorSessionRecord
    | null
    | undefined;
  return raw && typeof raw.sessionId === 'string' ? raw : null;
}

/**
 * Open the staged package in PearSign's embedded editor (send mode): the same PDF, fields and
 * values the normal Send would use. Nothing is sent until the user clicks Send in the editor;
 * then `finishPearSignPackageEditor` records the envelope like a normal send.
 */
export async function openPearSignPackageEditor(
  contractId: number,
  actorUserId: string | null,
  body: { origin?: unknown; message?: string; allowRepeat?: unknown },
) {
  const origin = editorOrigin(body.origin);
  const prep = await preparePackageSend(contractId, body);
  const { pkg, fieldValues, pdf, createFields, signerRoles, message } = prep;
  let session;
  try {
    session = await createPearSignEditorSession({
      mode: 'send',
      allowedOrigins: [origin],
      documentBase64: pdf.toString('base64'),
      fields: createFields,
      signerRoles,
      fieldValues,
      recipients: pkg.recipients.map((r) => ({ roleId: r.roleId, name: r.name, email: r.email })),
      options: { title: pkg.title, message, expirationDays: 30, ...(body.allowRepeat === true ? { allowRepeat: true } : {}) },
      metadata: { contractId, source: 'cashable-crm' },
      expiresInSeconds: 3600,
    });
  } catch (e) {
    if (e instanceof PearSignApiError) {
      const hint =
        e.status === 401 || e.status === 403
          ? ' The PearSign API key on the server is not allowed to open the editor; it needs an owner/admin key with envelopes:create, envelopes:write and envelopes:send.'
          : '';
      throw new PearSignContractError(`${e.message}${hint}`, e.status >= 500 ? 502 : 400);
    }
    throw e;
  }
  if (!session.sessionId || !session.editorUrl) {
    throw new PearSignContractError('PearSign did not return an editor link. Try again.', 502);
  }
  await writeEditorSession(contractId, {
    sessionId: session.sessionId,
    createdAt: new Date().toISOString(),
    createdByUserId: actorUserId,
    message,
  });
  console.info('[PearSign] editor session opened', { contractId, sessionId: session.sessionId, fields: createFields.length });
  return { sessionId: session.sessionId, editorUrl: session.editorUrl, expiresAt: session.expiresAt ?? null };
}

/**
 * The package as it went out of the editor: CRM fields matched back by name (moved/resized boxes
 * keep their Review key), fields added in the editor get their own key, and values typed in the
 * editor win. Used for the CRM-drawn PDF until the envelope is completed.
 */
export function packageFromEditorFields(
  pkg: Pick<PearSignStagedPackage, 'fields' | 'recipients' | 'documents' | 'mergedPdfUrl'>,
  sendName: Map<string, string>,
  values: Record<string, string>,
  sentStyles: Record<string, PearSignFieldStyle> | undefined,
  finalFields: PearSignEditorField[],
): { sentPackage: NonNullable<PearSignContractState['package']>; values: Record<string, string> } | null {
  const byName = new Map<string, PearSignPackageField>();
  for (const f of pkg.fields) byName.set(sendName.get(f.name) ?? f.name, f);
  const outValues = { ...values };
  const styles: Record<string, PearSignFieldStyle> = { ...(sentStyles ?? {}) };
  const fields: PearSignPackageField[] = [];
  for (const ef of finalFields) {
    const p = ef.position ?? {};
    const page = Number(p.page);
    const x = Number(p.x);
    const y = Number(p.y);
    const width = Number(p.width);
    const height = Number(p.height);
    if (![page, x, y, width, height].every(Number.isFinite)) return null;
    const orig = byName.get(ef.fieldName);
    const kind: PackageFieldKind =
      ef.type === 'signature' || ef.type === 'initials' || ef.type === 'date' ? ef.type : 'text';
    const prefill = ef.prefillValue == null ? '' : String(ef.prefillValue);
    const key = orig?.key ?? `editor__${ef.fieldName}`;
    const signerFilled = orig ? orig.signerFilled : kind === 'signature' || kind === 'initials' || !prefill.trim();
    if (!signerFilled && (prefill.trim() || !orig)) outValues[key] = prefill;
    if (!signerFilled && Number(ef.fontSize) > 0) styles[key] = { ...(styles[key] ?? {}), fontSize: Number(ef.fontSize) };
    fields.push({
      name: ef.fieldName,
      key,
      label: orig?.label ?? ef.fieldName,
      docIndex: orig?.docIndex ?? 0,
      type: kind,
      roleId: ef.roleId || orig?.roleId || pkg.recipients[0]?.roleId || '',
      signerFilled,
      required: ef.required ?? orig?.required ?? false,
      page,
      x,
      y,
      width,
      height,
    });
  }
  if (!fields.length) return null;
  return {
    sentPackage: { mergedPdfUrl: pkg.mergedPdfUrl, fields, recipients: pkg.recipients, documents: pkg.documents, styles },
    values: outValues,
  };
}

/**
 * Called when the editor reports it finished (and safe to call again): reads the session from
 * PearSign and, once it has an envelope, records it exactly like a normal send.
 */
export async function finishPearSignPackageEditor(
  contractId: number,
  actorUserId: string | null,
  body: { sessionId?: unknown },
) {
  const contract = await loadContract(contractId);
  const record = readEditorSession(contract.contractPrefillOverrides);
  const sessionId = String(body.sessionId ?? '').trim();
  if (!record || !sessionId || record.sessionId !== sessionId) {
    throw new PearSignContractError('That PearSign editor session does not belong to this contract.', 404);
  }
  const session = await getPearSignEditorSession(sessionId);
  const status = String(session.status || '').toLowerCase();
  const current = readState(contract.contractPrefillOverrides);
  if (session.envelopeId && current?.envelopeId === session.envelopeId) {
    return { status: 'sent', state: current, alreadyRecorded: true };
  }
  if (status === 'cancelled' || status === 'expired') {
    await writeEditorSession(contractId, null);
    return { status, state: current };
  }
  if (status !== 'completed' || !session.envelopeId) {
    if (status === 'completed' && session.delivery) {
      throw new PearSignContractError(
        `PearSign finished the editor but the envelope was not confirmed (delivery: ${session.delivery}). Check PearSign before sending again.`,
        502,
      );
    }
    return { status: status || 'open', state: current };
  }

  const prep = await preparePackageSend(contractId, { message: record.message });
  const { pkg, values, sendName, sentStyles } = prep;
  const edited = session.fields?.length ? packageFromEditorFields(pkg, sendName, values, sentStyles, session.fields) : null;
  // PearSign's editor sends the signing invites itself.
  const { next } = await recordPackageSent(contractId, actorUserId ?? record.createdByUserId, prep, {
    envelopeId: session.envelopeId,
    templateId: session.templateId ?? null,
    status: 'sent',
    values: edited?.values ?? values,
    sentPackage: edited?.sentPackage ?? null,
    pearSignEmailedSigners: true,
    signingUrls: [],
    source: 'pearsign_editor_send',
  });
  await writeEditorSession(contractId, null);
  console.info('[PearSign] editor send recorded', {
    contractId,
    sessionId,
    envelopeId: session.envelopeId,
    fields: session.fields?.length ?? 0,
    redrawable: Boolean(edited),
  });
  return { status: 'sent', state: next, documents: pkg.documents.map((d) => d.name) };
}
