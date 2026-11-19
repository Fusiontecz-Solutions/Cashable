import type { Prisma } from '@prisma/client';
import prisma from '../../config/prismaClient';
import uploadService from '../uploadService';
import { resolveDocumentOwnerNumericUserId } from '../../middleware/authMiddleware';
import { syncApplicationWorkflowFromContractEnvelopeStatus } from '../contractApplicationWorkflowSync';
import { formatContractOfferAmountForSubject } from '../../utils/contractEnvelopeEmailSubject';
import { getDocumentLayout, type DocumentLayoutKey } from '../docusign/layouts/document-layout.registry';
import { getPrefillDisplayLabel } from '../docusign/utils/prefill-layout-bridge';
import type { PrefillFieldInput } from '../docusign/utils/docusign-prefill';
import { fetchRemoteAssetBuffer } from '../cloudinaryInlinePreviewService';
import {
  PearSignApiError,
  createPearSignTemplate,
  deletePearSignTemplate,
  downloadPearSignEnvelopePdf,
  getPearSignEnvelope,
  getPearSignTemplate,
  isPearSignConfigured,
  sendPearSignEnvelope,
  voidPearSignEnvelope,
  type PearSignEnvelopeDetails,
  type PearSignFieldType,
  type PearSignTemplate,
  type PearSignTemplateCreateInput,
} from './pearsign-client';
import { buildPearSignPreviewPdf, pearSignFieldPos } from './pearsign-preview.service';
import {
  listPearSignContractTemplates,
  resolvePearSignContractTemplate,
  type PearSignTemplateRow,
} from './pearsign-template-registry';
import {
  PEARSIGN_SIGNER_FILLED_TYPES,
  buildPearSignTemplateSpec,
  cleanStyles,
  isPearSignIndependentKey,
  mergeStyles,
  pearSignBaseKey,
  pearSignHeightForFont,
  pearSignIndependentLabel,
  pearSignValueKey,
  type PearSignFieldStyle,
  type PearSignOwnerVariant,
} from './pearsign-template-spec';
import { computePearSignCrmValues, type PearSignSignerRoleInput } from './pearsign-values.service';
import {
  notifyPearSignContractSent,
  notifyPearSignContractSigned,
  notifyPearSignStatusChange,
  pearSignShouldEmailSigners,
} from './pearsign-mail.service';
import { contractStatusNoticeGroup } from '../emailTemplates/contractStatusEmailHtml';
import type { ContractUpdateThreads } from './pearsign-mail.service';
import { handleContractSigningStatusTransition } from '../contractSigningStatusEffects';

/**
 * PearSign main-contract flow for Cashable (phase 1 of the Dropbox Sign → PearSign move).
 *
 * Review → Send mirrors the Meridian implementation:
 *   1. review   — CRM values for every template field (computed by the same pipeline as
 *                 the Dropbox Sign send) + any Review edits saved on the contract
 *   2. preview  — server-drawn filled PDF (pearsign-preview.service.ts)
 *   3. overrides— edits made in the Review modal, saved per layout variable
 *   4. send     — PearSign envelope from the registered template; values recomputed
 *                 server-side (never trusted from the browser) + saved overrides
 *   5. sync / void / download — envelope lifecycle; a cron polls active envelopes
 *
 * State lives on `Contract.contractPrefillOverrides.pearsignMainContract`; the envelope
 * is also linked on `Document` (one per application) so the rest of the CRM (Sent step,
 * application lists, workflow stages) sees the contract as sent / completed.
 */

export const PEARSIGN_STATE_KEY = 'pearsignMainContract';

export class PearSignContractError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'PearSignContractError';
  }
}

export type PearSignRecipient = { roleId: string; roleName?: string; name: string; email: string };

export type PearSignContractState = {
  templateId?: string;
  funderProfileId?: string;
  ownerCount?: number;
  /** Review edits, keyed by layout variable. Applied on top of the CRM values at send. */
  overrides?: Record<string, string>;
  /** Values actually sent (layout variable → value), for redrawing the sent contract. */
  values?: Record<string, string>;
  recipients?: PearSignRecipient[];
  envelopeId?: string;
  status?: string;
  sentAt?: string;
  completedAt?: string | null;
  /** When Owner 1 signed — the deal moves to Contract Signed at this point. */
  customerSignedAt?: string | null;
  signedPdfUrl?: string | null;
  lastSyncedAt?: string;
  sentByUserId?: string | null;
  /** CC addresses chosen at send (PearSign has no CC — the CRM emails them itself). */
  ccEmails?: string[];
  /** Sent after the CRM started emailing CCs: the signed copy goes to them on completion. */
  crmCcMail?: boolean;
  title?: string;
  history?: Array<{ envelopeId: string; status: string; sentAt?: string; endedAt?: string }>;
  /** Package sends use a per-send template, deleted once the envelope is finished. */
  ephemeralTemplate?: boolean;
  templateDeletedAt?: string | null;
  /** Package sends: what was sent (merged PDF + field positions), to redraw the sent package. */
  package?: {
    mergedPdfUrl: string;
    fields: Array<{
      name: string;
      key: string;
      type: string;
      roleId: string;
      signerFilled: boolean;
      required: boolean;
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
    recipients: Array<{ roleId: string; roleName: string; name: string; email: string }>;
    documents: Array<{ index: number; name: string; startPage: number; pageCount: number }>;
    /** Font sizes sent with the package (field key → style). */
    styles?: Record<string, PearSignFieldStyle>;
  };
  /** Review font sizes, keyed like `overrides`. Any set → the send uses a per-send copy of the template. */
  styles?: Record<string, PearSignFieldStyle>;
  /** Registered template a per-send copy was made from (redraws the sent contract). */
  baseTemplateId?: string;
};

const TERMINAL_STATUSES = new Set(['completed', 'voided', 'declined', 'expired', 'cancelled']);

/** Delete a finished package envelope's per-send template (best effort, once). */
async function cleanupEphemeralTemplate(contractId: number, state: PearSignContractState): Promise<PearSignContractState> {
  if (!state.ephemeralTemplate || !state.templateId || state.templateDeletedAt) return state;
  if (!TERMINAL_STATUSES.has(String(state.status || '').toLowerCase())) return state;
  try {
    await deletePearSignTemplate(state.templateId);
  } catch (e) {
    if (!(e instanceof PearSignApiError && e.status === 404)) {
      console.warn(`[PearSign] could not delete package template ${state.templateId}:`, (e as Error)?.message);
      return state;
    }
  }
  console.info(`[PearSign] deleted package template ${state.templateId} (contract ${contractId}, envelope ${state.status})`);
  return { ...state, templateDeletedAt: new Date().toISOString() };
}

const ACTIVE_STATUSES = new Set(['sent', 'in_signing', 'viewed', 'signed', 'partially_signed', 'draft']);

export function isActivePearSignStatus(status?: string | null): boolean {
  return ACTIVE_STATUSES.has(String(status || '').toLowerCase());
}

function contractStatusFor(status: string): 'SENT' | 'VIEWED' | 'SIGNED' | 'COMPLETED' | 'DECLINED' | 'REVOKED' | 'EXPIRED' {
  switch (String(status || '').toLowerCase()) {
    case 'viewed':
      return 'VIEWED';
    case 'signed':
    case 'partially_signed':
      return 'SIGNED';
    case 'completed':
      return 'COMPLETED';
    case 'declined':
      return 'DECLINED';
    case 'voided':
      return 'REVOKED';
    case 'expired':
      return 'EXPIRED';
    default:
      return 'SENT';
  }
}

function documentStatusFor(status: string): string {
  const s = String(status || '').toLowerCase();
  if (['completed', 'voided', 'declined', 'expired', 'viewed'].includes(s)) return s;
  if (s === 'signed' || s === 'partially_signed') return 'signed';
  return 'sent';
}

// ---------- template cache ----------

const TEMPLATE_TTL_MS = 30 * 60_000;
const templateCache = new Map<string, { at: number; template: PearSignTemplate }>();

export async function loadTemplate(templateId: string, fresh = false): Promise<PearSignTemplate> {
  const hit = templateCache.get(templateId);
  if (!fresh && hit && Date.now() - hit.at < TEMPLATE_TTL_MS) return hit.template;
  try {
    const template = await getPearSignTemplate(templateId);
    templateCache.set(templateId, { at: Date.now(), template });
    return template;
  } catch (e) {
    if (e instanceof PearSignApiError && e.status === 404) {
      throw new PearSignContractError(
        `PearSign template ${templateId} no longer exists. Re-run src/scripts/createPearSignContractTemplates.ts --register.`,
        502,
      );
    }
    throw e;
  }
}

/**
 * Field names the signer completes in PearSign (signature, initials and fill-at-signing
 * text) — derived from the same layout the template was generated from.
 */
function signerFilledFieldNames(row: PearSignTemplateRow, template: PearSignTemplate): Set<string> {
  const out = new Set<string>();
  try {
    const spec = buildPearSignTemplateSpec({
      layout: getDocumentLayout(row.layoutKey as DocumentLayoutKey),
      owners: (row.ownerCount >= 2 ? 2 : 1) as PearSignOwnerVariant,
      funderName: '',
      documentLabel: '',
    });
    for (const f of spec.fields) if (f.signerFilled) out.add(f.fieldName);
  } catch (err) {
    console.warn('[PearSign] could not rebuild template spec for', row.layoutKey, (err as Error)?.message);
  }
  for (const f of template.fields ?? []) if (PEARSIGN_SIGNER_FILLED_TYPES.has(f.type)) out.add(f.fieldName);
  return out;
}

// ---------- funder ----------

export async function getPearSignFunderStatus(funderProfileId: string) {
  const rows = await listPearSignContractTemplates(funderProfileId);
  return {
    configured: isPearSignConfigured(),
    enabled: isPearSignConfigured() && rows.length > 0,
    templates: rows.map((r) => ({ ownerCount: r.ownerCount, templateId: r.pearsignTemplateId, name: r.name, fieldCount: r.fieldCount })),
  };
}

// ---------- contract state ----------

export async function loadContract(contractId: number) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, applicationId: true, status: true, contractPrefillOverrides: true, funderName: true },
  });
  if (!contract) throw new PearSignContractError('Contract not found.', 404);
  return contract;
}

export function readState(overrides: unknown): PearSignContractState | null {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return null;
  const raw = (overrides as Record<string, unknown>)[PEARSIGN_STATE_KEY];
  if (!raw || typeof raw !== 'object') return null;
  return raw as PearSignContractState;
}

export async function writeState(contractId: number, next: PearSignContractState, extra?: Prisma.ContractUpdateInput) {
  await prisma.$transaction(async (tx) => {
    const row = await tx.contract.findUnique({ where: { id: contractId }, select: { contractPrefillOverrides: true } });
    const base =
      row?.contractPrefillOverrides && typeof row.contractPrefillOverrides === 'object' && !Array.isArray(row.contractPrefillOverrides)
        ? (row.contractPrefillOverrides as Record<string, unknown>)
        : {};
    await tx.contract.update({
      where: { id: contractId },
      data: {
        ...(extra ?? {}),
        contractPrefillOverrides: { ...base, [PEARSIGN_STATE_KEY]: next } as Prisma.InputJsonValue,
      },
    });
   }, { timeout: 30_000, maxWait: 10_000 }); // large package JSON over Neon
}

export function cleanValues(values: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!values || typeof values !== 'object') return out;
  for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
    const key = String(k || '').trim();
    if (!/^[a-z0-9_]{1,80}$/i.test(key)) continue;
    if (v === null || v === undefined) continue;
    out[key] = String(v).slice(0, 2000);
  }
  return out;
}

function cleanEmails(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return [
    ...new Set(list.map((e) => String(e || '').trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))),
  ].slice(0, 20);
}

function cleanPrefillFields(list: unknown): PrefillFieldInput[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((f) => f && typeof f === 'object' && String((f as { id?: unknown }).id ?? '').trim())
    .map((f) => ({ id: String((f as { id: unknown }).id), value: String((f as { value?: unknown }).value ?? '') }))
    .slice(0, 2000) as PrefillFieldInput[];
}

function cleanRoles(list: unknown): PearSignSignerRoleInput[] {
  if (!Array.isArray(list)) return [];
  return list.filter((r) => r && typeof r === 'object').slice(0, 20) as PearSignSignerRoleInput[];
}

export async function getPearSignContractState(contractId: number) {
  const contract = await loadContract(contractId);
  return { contractId, contractStatus: contract.status, state: readState(contract.contractPrefillOverrides) };
}

// ---------- review ----------

export type PearSignReviewBody = {
  funderProfileId?: string;
  prefillFields?: unknown;
  roles?: unknown;
  ownerCount?: number;
  contractState?: string | null;
};

type ResolvedReview = {
  contract: Awaited<ReturnType<typeof loadContract>>;
  row: PearSignTemplateRow;
  template: PearSignTemplate;
  signerFilled: Set<string>;
  crm: Awaited<ReturnType<typeof computePearSignCrmValues>>;
  overrides: Record<string, string>;
  values: Record<string, string>;
  styles: Record<string, PearSignFieldStyle>;
  state: PearSignContractState | null;
};

async function resolveReview(contractId: number, body: PearSignReviewBody, freshTemplate = false): Promise<ResolvedReview> {
  if (!isPearSignConfigured()) throw new PearSignContractError('PEARSIGN_API_KEY is not configured on the server.', 500);
  const funderProfileId = String(body.funderProfileId || '').trim();
  if (!funderProfileId) throw new PearSignContractError('Select a funder first.');
  const contract = await loadContract(contractId);

  const crm = await computePearSignCrmValues({
    contractId,
    funderProfileId,
    funderName: contract.funderName,
    contractState: body.contractState ?? null,
    prefillFields: cleanPrefillFields(body.prefillFields),
    roles: cleanRoles(body.roles),
    ownerCount: body.ownerCount,
  });

  const row = await resolvePearSignContractTemplate(funderProfileId, crm.ownerCount);
  if (!row) {
    throw new PearSignContractError(
      `No PearSign contract template is registered for this funder (${crm.ownerCount} owner${crm.ownerCount > 1 ? 's' : ''}).`,
      404,
    );
  }
  const template = await loadTemplate(row.pearsignTemplateId, freshTemplate);
  // Independent fields (page-1 EIN) start from their layout variable's CRM value.
  for (const f of template.fields ?? []) {
    const key = pearSignValueKey(f.fieldName);
    const base = pearSignBaseKey(f.fieldName);
    if (key !== base && crm.values[key] === undefined) crm.values[key] = crm.values[base] ?? '';
  }
  const state = readState(contract.contractPrefillOverrides);
  const overrides = cleanValues(state?.overrides);
  const values = { ...crm.values, ...overrides };
  const styles = cleanStyles(state?.styles);
  return { contract, row, template, signerFilled: signerFilledFieldNames(row, template), crm, overrides, values, styles, state };
}

/** Everything the Review modal needs: template layout, CRM values, saved edits, recipients, blockers. */
export async function getPearSignReview(contractId: number, body: PearSignReviewBody) {
  const r = await resolveReview(contractId, body);
  const pageCount = Math.max(1, ...(r.template.fields ?? []).map((f) => Number(f.position?.page) || 1));
  const roleName = new Map(r.template.signerRoles.map((x) => [x.roleId, x.name]));

  const fieldLayout: Array<{ key: string; page: number; x: number; y: number; width: number; height: number }> = [];
  const signerBoxes: Array<{ kind: string; roleName: string; page: number; x: number; y: number; width: number; height: number }> = [];
  const keys = new Map<string, { key: string; label: string; pages: number[] }>();
  for (const f of r.template.fields ?? []) {
    const box = pearSignFieldPos(f, pageCount);
    if (!box) continue;
    if (r.signerFilled.has(f.fieldName)) {
      signerBoxes.push({
        kind: f.type === 'signature' ? 'Sign' : f.type === 'initials' ? 'Initial' : 'Signer completes',
        roleName: roleName.get(f.roleId) || f.roleName || '',
        ...box,
      });
      continue;
    }
    const key = pearSignValueKey(f.fieldName);
    const base = pearSignBaseKey(f.fieldName);
    fieldLayout.push({ key, ...box });
    const label = key === base ? getPrefillDisplayLabel(key) : pearSignIndependentLabel(getPrefillDisplayLabel(base), box.page);
    const cur = keys.get(key) ?? { key, label, pages: [] };
    if (!cur.pages.includes(box.page)) cur.pages.push(box.page);
    keys.set(key, cur);
  }
  const fields = [...keys.values()].sort((a, b) => Math.min(...a.pages) - Math.min(...b.pages));

  const blockers: string[] = [];
  if (r.crm.reverseDisbursementEnabled) {
    blockers.push(
      'This contract has a reverse disbursement schedule page. PearSign templates are fixed documents and cannot append it — send this contract with Dropbox Sign.',
    );
  }
  if (r.crm.recipients.length < r.crm.ownerCount) {
    blockers.push(
      r.crm.ownerCount >= 2
        ? 'Add a name and email for both owners in Contract Signers.'
        : 'Add a name and email for the signer in Contract Signers.',
    );
  }
  for (const rcp of r.crm.recipients) {
    if (!rcp.name) blockers.push(`${rcp.roleName} has no name in Contract Signers.`);
  }
  if (r.state?.envelopeId && isActivePearSignStatus(r.state.status)) {
    blockers.push('A PearSign envelope is already out for signature for this contract. Void it first to send a new one.');
  }

  return {
    funderProfileId: r.row.funderProfileId,
    funderName: r.contract.funderName,
    templateId: r.row.pearsignTemplateId,
    templateName: r.template.name,
    templateStatus: r.template.status,
    ownerCount: r.crm.ownerCount,
    signerRoles: r.template.signerRoles,
    fields,
    fieldLayout,
    signerBoxes,
    crmValues: r.crm.values,
    overrides: r.overrides,
    values: r.values,
    blankKeys: fields.filter((f) => !String(r.values[f.key] ?? '').trim()).map((f) => f.key),
    keepBlankKeys: fields.filter((f) => isPearSignIndependentKey(f.key)).map((f) => f.key),
    styles: r.styles,
    recipients: r.crm.recipients,
    blockers,
    warnings: r.crm.divergent.length
      ? [`Some fields print different values on different pages in the CRM layout: ${r.crm.divergent.join(', ')}.`]
      : [],
    state: r.state,
  };
}

/**
 * Save Review edits (layout variable → value). An empty string or null clears the edit (back to the CRM value).
 * `styles` (`{ key: { fontSize } }`, null size = auto) saves font sizes the same way.
 */
export async function savePearSignOverrides(contractId: number, body: { overrides?: unknown; styles?: unknown }) {
  const contract = await loadContract(contractId);
  const prev = readState(contract.contractPrefillOverrides) ?? {};
  if (prev.envelopeId && isActivePearSignStatus(prev.status)) {
    throw new PearSignContractError('This contract is out for signature in PearSign; void it before editing values.', 409);
  }
  const incoming = (body.overrides && typeof body.overrides === 'object' ? body.overrides : {}) as Record<string, unknown>;
  const next = { ...cleanValues(prev.overrides) };
  for (const [k, v] of Object.entries(incoming)) {
    const key = String(k || '').trim();
    if (!/^[a-z0-9_]{1,80}$/i.test(key)) continue;
    const value = v === null || v === undefined ? '' : String(v).slice(0, 2000);
    if (value.trim() || isPearSignIndependentKey(key)) next[key] = value;
    else delete next[key];
  }
  const styles = mergeStyles(cleanStyles(prev.styles), body.styles);
  const state: PearSignContractState = { ...prev, overrides: next, styles };
  await writeState(contractId, state);
  return { overrides: next, styles };
}

/**
 * Filled preview PDF of the given values (Review edits not yet saved are allowed).
 * `drawValues: false` returns the agreement with only the signer boxes drawn — the
 * Review modal draws the values itself, live, on top of it.
 */
export async function buildPearSignReviewPreview(
  contractId: number,
  body: PearSignReviewBody & { values?: unknown; drawValues?: boolean },
) {
  const r = await resolveReview(contractId, body);
  const values =
    body.drawValues === false
      ? {}
      : body.values && typeof body.values === 'object'
        ? { ...r.values, ...cleanValues(body.values) }
        : r.values;
  const business = String(values.client_legal_name || '').trim();
  const { pdf, filledFieldCount } = await buildPearSignPreviewPdf({
    template: r.template,
    sourcePdfUrl: r.row.sourcePdfUrl,
    values,
    signerFilledNames: r.signerFilled,
    styles: r.styles,
    title: `${r.contract.funderName || 'Cashable'} Agreement${business ? ` - ${business}` : ''} (preview)`,
  });
  const safe = `${r.contract.funderName || 'Agreement'}_${business || 'contract'}`
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  return { pdf, filledFieldCount, fileName: `${safe || 'contract'}_preview.pdf` };
}

// ---------- send ----------

/**
 * Per-send copy of the registered contract template carrying the Review font sizes
 * (PearSign formatting is per template field). Deleted with the other per-send
 * templates once the envelope is finished. Returns the new template id.
 */
async function createStyledContractTemplate(contractId: number, r: ResolvedReview): Promise<string> {
  if (!r.row.sourcePdfUrl) throw new PearSignContractError('The funder contract PDF is missing; cannot apply font sizes.', 500);
  let pdf: Buffer;
  try {
    pdf = await fetchRemoteAssetBuffer(r.row.sourcePdfUrl);
  } catch (err) {
    throw new PearSignContractError(`Could not load the contract PDF: ${(err as Error)?.message}`, 502);
  }
  const fields: PearSignTemplateCreateInput['fields'] = [];
  for (const f of r.template.fields ?? []) {
    const p = f.position;
    if (![p?.page, p?.x, p?.y, p?.width, p?.height].every((n) => Number.isFinite(Number(n)))) {
      throw new PearSignContractError(`PearSign template field ${f.fieldName} has no position; cannot copy it.`, 502);
    }
    const fontSize = r.signerFilled.has(f.fieldName) ? undefined : r.styles[pearSignValueKey(f.fieldName)]?.fontSize;
    fields.push({
      fieldName: f.fieldName,
      type: f.type as PearSignFieldType,
      required: f.required,
      roleId: f.roleId,
      position: {
        page: Number(p!.page),
        x: Number(p!.x),
        y: Number(p!.y),
        width: Number(p!.width),
        height: pearSignHeightForFont(Number(p!.height), fontSize),
      },
      ...(fontSize ? { fontSize } : {}),
    });
  }
  let created: PearSignTemplate;
  try {
    created = await createPearSignTemplate({
      name: `CRM contract — ${r.template.name} — contract ${contractId} — ${new Date().toISOString().slice(0, 16)}`.slice(0, 200),
      description: 'Per-send copy of the contract template with Review font sizes (Cashable CRM). Deleted after signing.',
      category: 'crm-contract',
      status: 'active',
      signerRoles: r.template.signerRoles.map((x) => ({ roleId: x.roleId, name: x.name, order: x.order })),
      fields,
      documentBase64: pdf.toString('base64'),
    });
  } catch (e) {
    if (e instanceof PearSignApiError) throw new PearSignContractError(e.message, e.status >= 500 ? 502 : 400);
    throw e;
  }
  const live = await getPearSignTemplate(created.id);
  if ((live.fields?.length ?? 0) !== fields.length) {
    await deletePearSignTemplate(created.id).catch(() => undefined);
    throw new PearSignContractError(
      `PearSign stored ${live.fields?.length ?? 0} of ${fields.length} fields for the contract copy; not sending.`,
      502,
    );
  }
  return created.id;
}

export async function sendPearSignContract(
  contractId: number,
  actorUserId: string | null,
  body: PearSignReviewBody & { message?: string; ccEmails?: unknown; senderName?: string },
) {
  const r = await resolveReview(contractId, body, true);
  const { contract, row, template, crm } = r;
  if (!contract.applicationId) throw new PearSignContractError('Contract has no application.');
  if (String(template.status).toLowerCase() !== 'active') {
    throw new PearSignContractError(`PearSign template "${template.name}" is not active.`);
  }
  if (crm.reverseDisbursementEnabled) {
    throw new PearSignContractError(
      'This contract has a reverse disbursement schedule page, which a PearSign template cannot carry. Send it with Dropbox Sign.',
    );
  }
  if (r.state?.envelopeId && isActivePearSignStatus(r.state.status)) {
    throw new PearSignContractError(
      'This contract already has a PearSign envelope out for signature. Void it first to send a new one.',
      409,
    );
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const roleIds = new Set(template.signerRoles.map((x) => x.roleId));
  const recipients = crm.recipients.filter((x) => roleIds.has(x.roleId));
  if (recipients.length !== template.signerRoles.length) {
    throw new PearSignContractError(
      template.signerRoles.length >= 2
        ? 'This deal has two owners: add a name and email for both in Contract Signers.'
        : 'Add a name and email for the signer in Contract Signers.',
    );
  }
  for (const x of recipients) {
    if (!x.name || !emailRe.test(x.email)) throw new PearSignContractError(`Enter a name and valid email for ${x.roleName}.`);
  }
  if (recipients.length === 2 && recipients[0].email === recipients[1].email) {
    throw new PearSignContractError('Owner 1 and Owner 2 must have different email addresses.');
  }

  // CRM values (+ Review edits) onto every template field that shares the layout variable.
  const fieldValues: Record<string, string> = {};
  let blank = 0;
  // Font sizes live on the template, so a styled send uses a per-send copy (keyed by field name).
  const styled = Object.keys(r.styles).length > 0;
  for (const f of template.fields ?? []) {
    if (r.signerFilled.has(f.fieldName)) continue;
    const v = String(r.values[pearSignValueKey(f.fieldName)] ?? '').trim();
    if (v) fieldValues[styled ? f.fieldName : f.fieldId] = v;
    else blank++;
  }
  const sendTemplateId = styled ? await createStyledContractTemplate(contractId, r) : row.pearsignTemplateId;
  console.info('[PearSign] send', {
    contractId,
    applicationId: contract.applicationId,
    templateId: sendTemplateId,
    baseTemplateId: styled ? row.pearsignTemplateId : undefined,
    styledFields: Object.keys(r.styles).length,
    ownerCount: crm.ownerCount,
    prefilled: Object.keys(fieldValues).length,
    blank,
    overrides: Object.keys(r.overrides).length,
  });

  const businessName = String(r.values.client_legal_name || '').trim() || contract.funderName || 'Contract';
  const rawAmount = String(r.values.purchase_amount || '').trim();
  const title = [businessName, rawAmount ? formatContractOfferAmountForSubject(rawAmount) : null, 'Signature Requested']
    .filter(Boolean)
    .join(' — ')
    .slice(0, 200);
  const message =
    String(body.message || '').trim().slice(0, 2000) ||
    `Please review and sign your ${contract.funderName || 'funding'} agreement.`;
  // The CRM emails the signing invites from Gmail; PearSign only does when PEARSIGN_SIGNER_INVITES=pearsign.
  const sendEmail = pearSignShouldEmailSigners();

  let result;
  try {
    result = await sendPearSignEnvelope({
      templateId: sendTemplateId,
      recipients: recipients.map((x) => ({ roleId: x.roleId, name: x.name, email: x.email })),
      fieldValues,
      sender: body.senderName ? { name: String(body.senderName).slice(0, 120) } : undefined,
      options: { title, message, expirationDays: 30, sendEmail },
    });
  } catch (e) {
    if (styled) await deletePearSignTemplate(sendTemplateId).catch(() => undefined);
    if (e instanceof PearSignApiError) throw new PearSignContractError(e.message, e.status >= 500 ? 502 : 400);
    throw e;
  }

  const sentAt = new Date();
  const prev = r.state;
  const next: PearSignContractState = {
    templateId: sendTemplateId,
    ...(styled
      ? { ephemeralTemplate: true, templateDeletedAt: null, baseTemplateId: row.pearsignTemplateId, styles: r.styles }
      : {}),
    funderProfileId: row.funderProfileId,
    ownerCount: crm.ownerCount,
    overrides: r.overrides,
    values: r.values,
    recipients,
    envelopeId: result.envelopeId,
    status: result.status || 'sent',
    sentAt: sentAt.toISOString(),
    completedAt: null,
    customerSignedAt: null,
    signedPdfUrl: null,
    lastSyncedAt: sentAt.toISOString(),
    sentByUserId: actorUserId,
    ccEmails: cleanEmails(body.ccEmails),
    crmCcMail: true,
    title,
    history: [
      ...(prev?.history ?? []),
      ...(prev?.envelopeId ? [{ envelopeId: prev.envelopeId, status: prev.status ?? '', sentAt: prev.sentAt }] : []),
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
    source: 'pearsign_send',
    contractId,
    contractStatusPrevious: String(contract.status),
    contractStatusNew: 'SENT',
  }).catch((err) => console.warn('[PearSign] workflow sync after send failed', err?.message));

  // "Contract Sent" copy (filled contract PDF) to every CC; logs PearSign's invites too.
  const ccMail = await notifyPearSignContractSent({
    contractId,
    applicationId: contract.applicationId,
    envelopeId: result.envelopeId,
    title,
    funderName: contract.funderName,
    values: r.values,
    signers: recipients.map((x) => ({ email: x.email, name: x.name, roleName: x.roleName })),
    ccEmails: next.ccEmails ?? [],
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
    ccMail,
  };
}

/** Notice group → the CRM's in-app contract-signing stage (see contractSigningStatusEffects). */
const IN_APP_STAGE: Record<'sent' | 'viewed' | 'signed', string> = {
  sent: 'sent',
  viewed: 'viewed',
  signed: 'signed',
};

/** Notice groups that are also emailed to the team (Sent is in-app only). */
const EMAILED_NOTICE_GROUPS = new Set(['viewed', 'signed']);

/** Last `<envelopeId>:<group>` announced (outside the state, like the signed notice). */
const STATUS_NOTICE_KEY = 'pearsignStatusNotice';
/** The team's email thread per envelope: `{ envelopeId, byRecipient: { email: { messageId, gmailThreadId } } }`. */
const TEAM_THREAD_KEY = 'pearsignTeamThread';
const statusNoticeClaimed = new Set<string>();
/** Per-contract queue, so two updates arriving together never both start a new email thread. */
const statusNoticeQueue = new Map<number, Promise<void>>();

/**
 * Tell the Cashable team about a contract once per envelope and notice: Sent, Viewed, Signed
 * (PearSign "signed" and "completed" both count as Signed). Every notice goes to the
 * Notifications inbox; Viewed and Signed are also emailed, in one thread per envelope.
 * Claimed atomically first so the webhook, the status job and Refresh never repeat one.
 */
export function sendStatusNoticeOnce(
  contractId: number,
  applicationId: string,
  funderName: string | null,
  state: PearSignContractState,
  priorStatus: string | null | undefined,
  recipientStatuses?: PearSignEnvelopeDetails['recipients'],
): Promise<void> {
  const prev = statusNoticeQueue.get(contractId) ?? Promise.resolve();
  const run = prev
    .catch(() => undefined)
    .then(() => announceStatus(contractId, applicationId, funderName, state, priorStatus, recipientStatuses));
  statusNoticeQueue.set(contractId, run);
  void run.finally(() => {
    if (statusNoticeQueue.get(contractId) === run) statusNoticeQueue.delete(contractId);
  });
  return run;
}

async function announceStatus(
  contractId: number,
  applicationId: string,
  funderName: string | null,
  state: PearSignContractState,
  priorStatus: string | null | undefined,
  recipientStatuses?: PearSignEnvelopeDetails['recipients'],
): Promise<void> {
  const envelopeId = state.envelopeId;
  const group = contractStatusNoticeGroup(String(state.status || ''));
  if (!envelopeId || !group) return;
  const claim = `${envelopeId}:${group}`;
  if (statusNoticeClaimed.has(claim)) return;
  statusNoticeClaimed.add(claim);
  const claimed = await prisma.$executeRaw`
    UPDATE "Contract"
    SET "contractPrefillOverrides" = jsonb_set(coalesce("contractPrefillOverrides", '{}'::jsonb), ARRAY[${STATUS_NOTICE_KEY}]::text[], to_jsonb(${claim}::text), true)
    WHERE id = ${contractId}
      AND coalesce("contractPrefillOverrides" ->> ${STATUS_NOTICE_KEY}, '') <> ${claim}
  `;
  if (!claimed) return;

  // In-app: Notifications inbox (Contracts), live refresh of open contract screens, activity log.
  const priorGroup = priorStatus ? contractStatusNoticeGroup(String(priorStatus)) : null;
  await handleContractSigningStatusTransition({
    applicationId,
    priorStatus: priorGroup && priorGroup !== group ? IN_APP_STAGE[priorGroup] : null,
    newStatus: IN_APP_STAGE[group],
    envelopeId,
    documentName: `${String(state.values?.client_legal_name || '').trim() || 'Merchant'} contract`,
    provider: 'pearsign',
  }).catch((err) => console.error('[PearSign] in-app status notification failed', err));

  if (!EMAILED_NOTICE_GROUPS.has(group)) return;
  const threads = await readTeamThreads(contractId, envelopeId);
  const result = await notifyPearSignStatusChange({
    contractId,
    applicationId,
    envelopeId,
    title: state.title || 'Contract',
    funderName,
    values: state.values,
    status: group,
    signers: state.recipients ?? [],
    recipientStatuses,
    threads,
  });
  if (JSON.stringify(result.threads) !== JSON.stringify(threads)) {
    await writeTeamThreads(contractId, envelopeId, result.threads).catch((err) =>
      console.warn('[PearSign] could not save the team email thread', (err as Error)?.message),
    );
  }
}

async function readTeamThreads(contractId: number, envelopeId: string): Promise<ContractUpdateThreads> {
  const row = await prisma.contract.findUnique({ where: { id: contractId }, select: { contractPrefillOverrides: true } });
  const overrides = row?.contractPrefillOverrides as Record<string, unknown> | null | undefined;
  const raw = overrides?.[TEAM_THREAD_KEY] as { envelopeId?: string; byRecipient?: ContractUpdateThreads } | undefined;
  // A new envelope (resend) starts a new thread.
  return raw?.envelopeId === envelopeId && raw.byRecipient && typeof raw.byRecipient === 'object' ? raw.byRecipient : {};
}

async function writeTeamThreads(contractId: number, envelopeId: string, byRecipient: ContractUpdateThreads): Promise<void> {
  const value = JSON.stringify({ envelopeId, byRecipient });
  await prisma.$executeRaw`
    UPDATE "Contract"
    SET "contractPrefillOverrides" = jsonb_set(coalesce("contractPrefillOverrides", '{}'::jsonb), ARRAY[${TEAM_THREAD_KEY}]::text[], ${value}::jsonb, true)
    WHERE id = ${contractId}
  `;
}

/** Last envelope whose signed copy was emailed to the CCs (outside the state, so a state write never clears it). */
const SIGNED_NOTICE_KEY = 'pearsignSignedNoticeEnvelopeId';
const signedNoticeClaimed = new Set<string>();

/**
 * Email the executed contract to the CCs once per envelope, when it is completed.
 * Claimed atomically first so overlapping syncs (cron + Refresh) never both send.
 */
async function sendSignedNoticeOnce(
  contractId: number,
  applicationId: string,
  funderName: string | null,
  state: PearSignContractState,
  signedPdf: Buffer | null,
): Promise<void> {
  const envelopeId = state.envelopeId;
  if (!envelopeId || !state.crmCcMail || !(state.ccEmails ?? []).length) return;
  if (String(state.status || '').toLowerCase() !== 'completed') return;
  if (signedNoticeClaimed.has(envelopeId)) return;
  signedNoticeClaimed.add(envelopeId);
  const claimed = await prisma.$executeRaw`
    UPDATE "Contract"
    SET "contractPrefillOverrides" = jsonb_set(coalesce("contractPrefillOverrides", '{}'::jsonb), ARRAY[${SIGNED_NOTICE_KEY}]::text[], to_jsonb(${envelopeId}::text), true)
    WHERE id = ${contractId}
      AND coalesce("contractPrefillOverrides" ->> ${SIGNED_NOTICE_KEY}, '') <> ${envelopeId}
  `;
  if (!claimed) return;

  let pdf = signedPdf;
  if (!pdf?.length) {
    try {
      pdf = await downloadPearSignEnvelopePdf(envelopeId, 'latest');
    } catch (err) {
      console.warn('[PearSign] signed PDF for the CC email unavailable:', (err as Error)?.message);
    }
  }
  await notifyPearSignContractSigned({
    contractId,
    applicationId,
    envelopeId,
    title: state.title || 'Contract',
    funderName,
    values: state.values,
    signers: state.recipients ?? [],
    ccEmails: state.ccEmails ?? [],
    pdf,
  });
}

export async function linkDocument(applicationId: string, actorUserId: string | null, envelopeId: string, sentAt: Date) {
  const existing = await prisma.document.findUnique({ where: { applicationId }, select: { userId: true } });
  const userId = await resolveDocumentOwnerNumericUserId(actorUserId, applicationId, existing?.userId);
  if (userId == null) throw new PearSignContractError('Cannot link contract: CRM user record not found for this session.');
  await prisma.document.upsert({
    where: { applicationId },
    create: { applicationId, envelopeId, status: 'sent', sentAt, userId },
    update: { envelopeId, status: 'sent', sentAt, completedAt: null, signedPdfUrl: null, signedPdfPublicId: null },
  });
}

// ---------- status ----------

const SIGNED_RECIPIENT_STATUSES = new Set(['completed', 'signed']);

/** When Owner 1 (recipients[0]) signed, or null. */
export function pearSignCustomerSignedAt(
  state: Pick<PearSignContractState, 'recipients'>,
  env: Pick<PearSignEnvelopeDetails, 'status' | 'completedAt' | 'recipients'>,
): string | null {
  const customerEmail = state.recipients?.[0]?.email?.trim().toLowerCase();
  const rcp = customerEmail
    ? env.recipients?.find((x) => x.signerEmail?.trim().toLowerCase() === customerEmail)
    : undefined;
  if (String(env.status || '').toLowerCase() === 'completed') {
    return rcp?.signedAt ?? env.completedAt ?? new Date().toISOString();
  }
  if (!rcp) return null;
  const signed = SIGNED_RECIPIENT_STATUSES.has(String(rcp.status || '').toLowerCase()) || !!rcp.signedAt;
  return signed ? rcp.signedAt ?? new Date().toISOString() : null;
}

export async function syncPearSignContract(contractId: number) {
  const contract = await loadContract(contractId);
  const state = readState(contract.contractPrefillOverrides);
  if (!state?.envelopeId) return { state, changed: false };

  const env = await getPearSignEnvelope(state.envelopeId);
  const status = String(env.status || state.status || 'sent').toLowerCase();
  const customerSignedAt = state.customerSignedAt ?? pearSignCustomerSignedAt(state, env);
  const changed = status !== String(state.status || '').toLowerCase() || !!customerSignedAt !== !!state.customerSignedAt;
  const next: PearSignContractState = {
    ...state,
    status,
    completedAt: env.completedAt ?? state.completedAt ?? null,
    customerSignedAt,
    lastSyncedAt: new Date().toISOString(),
  };

  // Archive the signed PDF once (same Cloudinary folder as the Dropbox Sign archive).
  let signedPdfPublicId: string | null = null;
  let signedPdf: Buffer | null = null;
  if (status === 'completed' && !state.signedPdfUrl) {
    try {
      const pdf = await downloadPearSignEnvelopePdf(state.envelopeId, 'latest');
      signedPdf = pdf;
      const up = await uploadService.uploadBuffer(pdf, 'ih-crm/signed-contracts', `pearsign_${state.envelopeId}.pdf`, {
        forcePdf: true,
      });
      if (up.success && up.data?.secure_url) {
        next.signedPdfUrl = up.data.secure_url;
        signedPdfPublicId = up.data.public_id ?? null;
      }
    } catch (err) {
      console.warn('[PearSign] signed PDF archive failed', (err as Error)?.message);
    }
  }

  // Package sends: drop the per-send template once the envelope is finished.
  Object.assign(next, await cleanupEphemeralTemplate(contractId, next));

  const contractStatus = contractStatusFor(status);
  await writeState(
    contractId,
    next,
    changed || next.signedPdfUrl !== state.signedPdfUrl ? { status: contractStatus } : undefined,
  );

  if (contract.applicationId) {
    try {
      await prisma.document.updateMany({
        where: { applicationId: contract.applicationId, envelopeId: state.envelopeId },
        data: {
          status: documentStatusFor(status),
          ...(status === 'completed' ? { completedAt: next.completedAt ? new Date(next.completedAt) : new Date() } : {}),
          ...(next.signedPdfUrl ? { signedPdfUrl: next.signedPdfUrl, signedPdfPublicId } : {}),
        },
      });
    } catch (err) {
      console.warn('[PearSign] document status update failed', (err as Error)?.message);
    }
    const cancelled = ['DECLINED', 'REVOKED', 'EXPIRED'].includes(contractStatus);
    const workflowStatus = customerSignedAt && !cancelled ? 'COMPLETED' : contractStatus;
    if (changed || workflowStatus === 'COMPLETED') {
      await syncApplicationWorkflowFromContractEnvelopeStatus(prisma, contract.applicationId, workflowStatus, {
        source: 'pearsign_sync',
        contractId,
        contractStatusPrevious: String(contract.status),
        contractStatusNew: contractStatus,
      }).catch((err) => console.warn('[PearSign] workflow sync failed', err?.message));
    }
    // Executed contract to the CCs (once per envelope).
    await sendSignedNoticeOnce(contractId, contract.applicationId, contract.funderName, next, signedPdf).catch((err) =>
      console.error('[PearSign] signed-copy CC email failed', err),
    );
    // "Contract Update: <Merchant> - <Status>" to the Cashable team (once per envelope + status).
    if (status !== String(state.status || '').toLowerCase()) {
      await sendStatusNoticeOnce(contractId, contract.applicationId, contract.funderName, next, state.status, env.recipients).catch((err) =>
        console.error('[PearSign] status update email failed', err),
      );
    }
  }

  return { state: next, changed };
}

export async function voidPearSignContract(contractId: number) {
  const contract = await loadContract(contractId);
  const state = readState(contract.contractPrefillOverrides);
  if (!state?.envelopeId) throw new PearSignContractError('No PearSign envelope to void.');
  if (!isActivePearSignStatus(state.status)) {
    throw new PearSignContractError(`Envelope is already ${state.status}; nothing to void.`);
  }
  try {
    await voidPearSignEnvelope(state.envelopeId);
  } catch (e) {
    if (e instanceof PearSignApiError && (e.status === 404 || e.status === 403)) {
      throw new PearSignContractError(
        'PearSign did not allow voiding this envelope with the CRM API key. Void it in the PearSign dashboard, then click Refresh status here.',
        400,
      );
    }
    throw e;
  }
  const endedAt = new Date().toISOString();
  const next: PearSignContractState = await cleanupEphemeralTemplate(contractId, {
    ...state,
    status: 'voided',
    lastSyncedAt: endedAt,
  });
  await writeState(contractId, next, { status: 'REVOKED' });
  if (contract.applicationId) {
    await prisma.document.updateMany({
      where: { applicationId: contract.applicationId, envelopeId: state.envelopeId },
      data: { status: 'voided' },
    });
    await syncApplicationWorkflowFromContractEnvelopeStatus(prisma, contract.applicationId, 'REVOKED', {
      source: 'pearsign_void',
      contractId,
      contractStatusPrevious: String(contract.status),
      contractStatusNew: 'REVOKED',
    }).catch((err) => console.warn('[PearSign] workflow sync after void failed', err?.message));
    await sendStatusNoticeOnce(contractId, contract.applicationId, contract.funderName, next, state.status).catch((err) =>
      console.error('[PearSign] status update email after void failed', err),
    );
  }
  return { state: next };
}

/**
 * Envelope PDF. Until completion PearSign's PDF is the bare template (values only exist
 * in its signing screen), so `latest` for an open envelope is redrawn from the values
 * stored at send time — the same renderer as the Review preview.
 */
export async function downloadPearSignContractPdf(
  contractId: number,
  version: 'latest' | 'original',
  requestedEnvelopeId?: string | null,
) {
  const contract = await loadContract(contractId);
  const state = readState(contract.contractPrefillOverrides);
  if (!state?.envelopeId) throw new PearSignContractError('No PearSign envelope for this contract.', 404);
  const wanted = String(requestedEnvelopeId || '').trim();
  const known = new Set([state.envelopeId, ...(state.history ?? []).map((h) => h.envelopeId)]);
  if (wanted && !known.has(wanted)) throw new PearSignContractError('That envelope does not belong to this contract.', 404);
  const envelopeId = wanted || state.envelopeId;

  const isCurrent = envelopeId === state.envelopeId;
  const completed = String(state.status || '').toLowerCase() === 'completed';
  if (version === 'latest' && isCurrent && !completed && state.values && state.package) {
    try {
      const { drawPearSignPackage } = await import('./pearsign-package.service');
      const { pdf } = await drawPearSignPackage(state.package, state.values, state.title || 'Contract');
      return { pdf, envelopeId, filledByCrm: true };
    } catch (err) {
      console.error('[PearSign] could not draw the sent package, falling back to the PearSign PDF:', err);
    }
  }
  if (version === 'latest' && isCurrent && !completed && state.values && state.templateId && !state.package) {
    try {
      const rows = await listPearSignContractTemplates(String(state.funderProfileId || ''));
      const registeredId = state.baseTemplateId || state.templateId;
      const row = rows.find((x) => x.pearsignTemplateId === registeredId);
      if (row) {
        const template = await loadTemplate(row.pearsignTemplateId);
        const { pdf } = await buildPearSignPreviewPdf({
          template,
          sourcePdfUrl: row.sourcePdfUrl,
          values: state.values,
          signerFilledNames: signerFilledFieldNames(row, template),
          styles: cleanStyles(state.styles),
          title: state.title || 'Contract',
        });
        return { pdf, envelopeId, filledByCrm: true };
      }
    } catch (err) {
      console.error('[PearSign] could not draw the sent contract, falling back to the PearSign PDF:', err);
    }
  }
  return { pdf: await downloadPearSignEnvelopePdf(envelopeId, version), envelopeId, filledByCrm: false };
}

/** Contracts with a PearSign envelope still out for signature (for the status job). */
export async function listActivePearSignContractIds(): Promise<number[]> {
  const rows = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM "Contract"
    WHERE "contractPrefillOverrides" -> ${PEARSIGN_STATE_KEY} ->> 'envelopeId' IS NOT NULL
      AND lower(coalesce("contractPrefillOverrides" -> ${PEARSIGN_STATE_KEY} ->> 'status', 'sent'))
          IN ('sent', 'in_signing', 'viewed', 'signed', 'partially_signed')
  `;
  return rows.map((x) => Number(x.id));
}

/** Contract id whose PearSign state holds this envelope (current or history). */
export async function findContractIdByPearSignEnvelopeId(envelopeId: string): Promise<number | null> {
  const id = String(envelopeId || '').trim();
  if (!id) return null;
  const rows = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM "Contract"
    WHERE "contractPrefillOverrides" -> ${PEARSIGN_STATE_KEY} ->> 'envelopeId' = ${id}
       OR ("contractPrefillOverrides" -> ${PEARSIGN_STATE_KEY} -> 'history') @> ${JSON.stringify([{ envelopeId: id }])}::jsonb
    LIMIT 1
  `;
  return rows[0] ? Number(rows[0].id) : null;
}
