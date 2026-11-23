import type { DocumentLayout, DocumentLayoutPlacement } from '../docusign/utils/convert-docusign-template-export';
import { FILL_AT_SIGNING_VARIABLES } from '../docusign/utils/build-envelope-from-layout';
import { getPrefillDisplayLabel } from '../docusign/utils/prefill-layout-bridge';
import type { PearSignFieldType, PearSignTemplateCreateInput } from './pearsign-client';

/**
 * Builds a PearSign template definition from a CRM coordinate layout
 * (`src/services/docusign/layouts/*.layout.json`) — the same placements the
 * Dropbox Sign / DocuSign send path uses, so every box lands where it does today.
 *
 * Field naming (the CRM ↔ PearSign contract):
 *   CRM-filled text  → `<layoutVariable>_p<page>[b|c…]`   e.g. `client_legal_name_p1`, `signature_date_p2b`
 *   signer-filled    → `<kind>_o<owner>_p<page>[b|c…]`    e.g. `signature_o1_p2`, `initials_o2_p5`
 *   fill-at-signing  → `<layoutVariable>_p<page>`          (assigned to Owner 1, left blank by the CRM)
 *
 * `pearSignBaseKey()` strips the `_p<page>[letter]` suffix, so every PearSign
 * field maps back to exactly one layout variable, and the CRM value of that
 * variable is copied onto every field that shares it.
 *
 * Conditions: the only `when` in the Cashable contract layout is `owners >= 2`
 * (all `signerParty: secondary`). PearSign templates are static, so each funder
 * gets two templates: `owners: 1` (secondary placements dropped, one role) and
 * `owners: 2` (all placements, two roles).
 */

/** PearSign rewrites custom role ids to `signer-<order>`, so use its ids from the start. */
export const PEARSIGN_OWNER1_ROLE_ID = 'signer-1';
export const PEARSIGN_OWNER2_ROLE_ID = 'signer-2';

export type PearSignOwnerVariant = 1 | 2;

/** Field kinds the signer completes in PearSign — never prefilled by the CRM. */
export const PEARSIGN_SIGNER_FILLED_TYPES = new Set(['signature', 'initials']);

/** `client_legal_name_p9b` → `client_legal_name`. */
export function pearSignBaseKey(fieldName: string): string {
  return String(fieldName || '')
    .trim()
    .replace(/_p\d+[a-z]?$/i, '');
}

/**
 * Fields that keep their own value instead of sharing their layout variable's value
 * (layout variable → pages within its document). The page-1 EIN can be edited or
 * cleared in Review without touching the EIN printed on the other pages.
 */
const PEARSIGN_INDEPENDENT_FIELDS: Record<string, readonly number[]> = {
  security_tax_ein: [1],
};

/** `security_tax_ein` on page 1 → `security_tax_ein_p1`; null when the field shares its variable's value. */
export function pearSignIndependentKey(variable: string, page: number): string | null {
  return PEARSIGN_INDEPENDENT_FIELDS[variable]?.includes(page) ? `${variable}_p${page}` : null;
}

/** Value key of a contract template field: its own key when independent, else the layout variable. */
export function pearSignValueKey(fieldName: string): string {
  const base = pearSignBaseKey(fieldName);
  const page = Number(/_p(\d+)[a-z]?$/i.exec(String(fieldName || '').trim())?.[1]);
  return pearSignIndependentKey(base, page) ?? base;
}

/** Independent keys (also package `d<n>__` keys) keep a cleared value blank instead of falling back to the CRM. */
export function isPearSignIndependentKey(key: string): boolean {
  const m = /^(?:d\d+__)?([a-z0-9_]+)_p(\d+)$/i.exec(String(key || ''));
  return !!m && pearSignIndependentKey(m[1], Number(m[2])) !== null;
}

/** Per-field formatting chosen in Review, keyed by value key. Unset = PearSign's auto-fit. */
export type PearSignFieldStyle = { fontSize?: number };

/** PearSign accepts 6–36pt on text fields. */
export const PEARSIGN_FONT_SIZE_MIN = 6;
export const PEARSIGN_FONT_SIZE_MAX = 36;

/** A valid font size in points (half points allowed), or null. */
export function cleanFontSize(v: unknown): number | null {
  const n = Math.round(Number(v) * 2) / 2;
  return Number.isFinite(n) && n >= PEARSIGN_FONT_SIZE_MIN && n <= PEARSIGN_FONT_SIZE_MAX ? n : null;
}

/** Stored styles → only valid keys and sizes. */
export function cleanStyles(raw: unknown): Record<string, PearSignFieldStyle> {
  const out: Record<string, PearSignFieldStyle> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[a-z0-9_]{1,80}$/i.test(k)) continue;
    const fontSize = cleanFontSize((v as { fontSize?: unknown } | null)?.fontSize);
    if (fontSize !== null) out[k] = { fontSize };
  }
  return out;
}

/**
 * Apply Review style edits (`{ key: { fontSize } }`; a null/invalid size clears it).
 * `allowed` limits the keys to the ones that exist in this review.
 */
export function mergeStyles(
  prev: Record<string, PearSignFieldStyle>,
  incoming: unknown,
  allowed?: (key: string) => boolean,
): Record<string, PearSignFieldStyle> {
  const next = { ...prev };
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return next;
  for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
    const key = String(k || '').trim();
    if (!/^[a-z0-9_]{1,80}$/i.test(key) || (allowed && !allowed(key))) continue;
    const fontSize = cleanFontSize((v as { fontSize?: unknown } | null)?.fontSize);
    if (fontSize !== null) next[key] = { fontSize };
    else delete next[key];
  }
  return next;
}

/**
 * PearSign rejects a text box shorter than its font size needs. Grow it downward
 * (top edge stays put) so the chosen size always fits. Mirrored in the Review modal.
 */
export function pearSignHeightForFont(height: number, fontSize?: number | null): number {
  // PearSign's rule: a box must be at least ceil(fontSize / 0.75) tall.
  return fontSize ? Math.max(height, Math.ceil(fontSize / 0.75)) : height;
}

/**
 * A box tall enough for `fontSize` (pearSignHeightForFont), grown evenly above and below so the
 * value stays centred on the printed line. Mirrored in the Review modal.
 */
export function pearSignBoxForFont<T extends { y: number; height: number }>(box: T, fontSize?: number | null): T {
  const height = pearSignHeightForFont(box.height, fontSize);
  if (height === box.height) return box;
  return { ...box, y: Math.max(0, box.y - (height - box.height) / 2), height };
}

/** Value size on state disclosure pages (pt): their body text is 12pt. */
export const PEARSIGN_DISCLOSURE_FONT = 12;

/** Smallest size a whole page may use; a value too long even at this size shrinks on its own. */
export const PEARSIGN_PAGE_FONT_MIN = 8;

/** Largest size (max PEARSIGN_VALUE_FONT_MAX) at which `text` fits `width`, by width only. */
export function pearSignWidthFitFontSize(
  text: string,
  width: number,
  measure: (text: string, size: number) => number,
  max: number = PEARSIGN_VALUE_FONT_MAX,
): number {
  const room = Math.max(4, width - 4);
  const t = String(text ?? '').trim();
  let size = max;
  if (!t) return size;
  while (size > PEARSIGN_VALUE_FONT_MIN && measure(t, size) > room) size -= 0.5;
  return size;
}

/**
 * One value size per page: every CRM-filled box on a page uses the largest size at which all of
 * that page's values fit their boxes (max 10pt), but never below PEARSIGN_PAGE_FONT_MIN — a value
 * too long even then shrinks on its own. Boxes grow to the size (pearSignBoxForFont).
 * Returns the size per field index.
 */
export function pearSignPageFontSizes(
  fields: Array<{ page: number; width: number; value: string }>,
  measure: (text: string, size: number) => number,
): number[] {
  const fits = fields.map((f) => pearSignWidthFitFontSize(f.value, f.width, measure));
  const pageSize = new Map<number, number>();
  fields.forEach((f, i) => {
    if (!String(f.value ?? '').trim()) return; // empty boxes do not pull the page down
    pageSize.set(f.page, Math.min(pageSize.get(f.page) ?? PEARSIGN_VALUE_FONT_MAX, fits[i]));
  });
  return fields.map((f, i) => {
    const page = Math.max(PEARSIGN_PAGE_FONT_MIN, pageSize.get(f.page) ?? PEARSIGN_VALUE_FONT_MAX);
    return Math.min(page, fits[i]);
  });
}

/** Largest value size a box gets (pt); body text on the forms is 10–11pt. */
export const PEARSIGN_VALUE_FONT_MAX = 10;
/** Smallest size a long value may shrink to (pt). */
export const PEARSIGN_VALUE_FONT_MIN = 6;

/**
 * One consistent value size per box: 75% of its height, capped at PEARSIGN_VALUE_FONT_MAX,
 * shrunk in half points only when the value is too wide.
 * `measure(text, size)` returns the text width in points (Helvetica). Mirrored in the Review modal.
 */
export function pearSignFitFontSize(
  text: string,
  box: { width: number; height: number },
  measure: (text: string, size: number) => number,
): number {
  // 75% of the box height reads well on these forms; the send still grows a box that PearSign
  // finds too short (pearSignHeightForFont), so the size never blocks a send.
  const byHeight = Math.round(box.height * 0.75 * 2) / 2;
  let size = Math.max(PEARSIGN_VALUE_FONT_MIN, Math.min(PEARSIGN_VALUE_FONT_MAX, byHeight));
  const room = Math.max(4, box.width - 4);
  const t = String(text ?? '').trim();
  if (!t) return size;
  while (size > PEARSIGN_VALUE_FONT_MIN && measure(t, size) > room) size -= 0.5;
  return size;
}

/** Sidebar label for an independent field, e.g. "Federal Tax ID (page 1)". */
export function pearSignIndependentLabel(baseLabel: string, page: number): string {
  return `${baseLabel} (page ${page})`;
}

export type PearSignFieldSpec = Omit<PearSignTemplateCreateInput['fields'][number], 'position'> & {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Layout variable the CRM fills (null for signature / initials). */
  variable: string | null;
  /** True when the signer completes it in PearSign (signature, initials, fill-at-signing). */
  signerFilled: boolean;
  placementId: string;
};

export type PearSignTemplateSpec = {
  name: string;
  description: string;
  category: string;
  signerRoles: PearSignTemplateCreateInput['signerRoles'];
  fields: PearSignFieldSpec[];
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Same default box sizes the Dropbox Sign bridge uses when a placement has none. */
const DEFAULT_SIZE: Record<string, { width: number; height: number }> = {
  signature: { width: 130, height: 20 },
  initials: { width: 42, height: 12 },
  text: { width: 160, height: 16 },
};

function isOwner2Placement(p: DocumentLayoutPlacement): boolean {
  return p.signerParty === 'secondary' || p.signerParty === 'owner2' || p.signerParty === 'guarantor2';
}

function placementApplies(p: DocumentLayoutPlacement, owners: PearSignOwnerVariant): boolean {
  const when = String(p.when || '').replace(/\s+/g, '');
  if (!when) return true;
  if (when === 'owners>=2') return owners >= 2;
  // Unknown condition: refuse to guess — the builder must be taught it explicitly.
  throw new Error(`Unsupported layout condition "${p.when}" on placement ${p.id}.`);
}

function isFillAtSigning(p: DocumentLayoutPlacement): boolean {
  const variable = String(p.variable || '').trim().toLowerCase();
  return p.fillAtSigning === true || FILL_AT_SIGNING_VARIABLES.has(variable);
}

export function buildPearSignTemplateSpec(input: {
  layout: DocumentLayout;
  owners: PearSignOwnerVariant;
  funderName: string;
  documentLabel: string;
}): PearSignTemplateSpec {
  const { layout, owners } = input;
  const signerRoles = [
    { roleId: PEARSIGN_OWNER1_ROLE_ID, name: 'Owner 1', order: 1 },
    ...(owners >= 2 ? [{ roleId: PEARSIGN_OWNER2_ROLE_ID, name: 'Owner 2', order: 2 }] : []),
  ];

  const used = new Map<string, number>();
  const uniqueName = (base: string, page: number) => {
    const stem = `${base}_p${page}`;
    const n = (used.get(stem) ?? 0) + 1;
    used.set(stem, n);
    // 1st → `_p2`, 2nd → `_p2b`, 3rd → `_p2c` … (pearSignBaseKey strips one letter).
    return n === 1 ? stem : `${stem}${String.fromCharCode(96 + n)}`;
  };

  const fields: PearSignFieldSpec[] = [];
  for (const p of layout.placements) {
    if (!placementApplies(p, owners)) continue;
    const page = num(p.pageNumber);
    if (page < 1) continue;
    const roleId = isOwner2Placement(p) ? PEARSIGN_OWNER2_ROLE_ID : PEARSIGN_OWNER1_ROLE_ID;
    const ownerNo = roleId === PEARSIGN_OWNER2_ROLE_ID ? 2 : 1;
    const t = String(p.type || '').toLowerCase();

    let type: PearSignFieldType;
    let variable: string | null = null;
    let signerFilled = false;
    let required = false;
    let base: string;

    if (t === 'signature') {
      type = 'signature';
      signerFilled = true;
      required = p.optional !== true;
      base = `signature_o${ownerNo}`;
    } else if (t === 'initial' || t === 'initials') {
      type = 'initials';
      signerFilled = true;
      required = p.optional !== true;
      base = `initials_o${ownerNo}`;
    } else if (t === 'text' || t === 'date') {
      // `date` placements carry `signature_date`, which the CRM fills with the
      // agreement date (prefill-layout-bridge: agreement_date → signature_date) —
      // the Dropbox Sign send prints it as fixed text, so it is CRM text here too.
      variable = String(p.variable || p.sourceTabLabel || '').trim();
      if (!variable) continue;
      type = 'text';
      if (isFillAtSigning(p)) {
        // Bank-portal details the merchant completes while signing (same as Dropbox Sign:
        // required there, so required here).
        signerFilled = true;
        required = true;
      }
      base = variable;
    } else {
      // Attachments / other placement kinds are not part of the Cashable contract.
      continue;
    }

    const size = DEFAULT_SIZE[type] ?? DEFAULT_SIZE.text;
    fields.push({
      fieldName: uniqueName(base, page),
      type,
      required,
      roleId,
      page,
      x: Math.max(0, Math.round(num(p.x))),
      y: Math.max(0, Math.round(num(p.y))),
      width: Math.round(num(p.width) > 0 ? num(p.width) : size.width),
      height: Math.round(num(p.height) > 0 ? num(p.height) : size.height),
      ...(variable && signerFilled ? { placeholder: getPrefillDisplayLabel(variable) } : {}),
      variable,
      signerFilled,
      placementId: String(p.id || ''),
    });
  }

  const ownerLabel = owners >= 2 ? '2 owners' : '1 owner';
  return {
    name: `${input.funderName} — ${input.documentLabel} (${ownerLabel})`,
    description:
      `CRM-managed template generated from layout "${layout.key}". ` +
      'Fields named <layoutVariable>_p<page> are filled by the Cashable CRM; do not rename them.',
    category: 'contract',
    signerRoles,
    fields,
  };
}

/** Strip CRM-only metadata before POSTing to PearSign. */
export function toPearSignCreateFields(spec: PearSignTemplateSpec): PearSignTemplateCreateInput['fields'] {
  return spec.fields.map((f) => ({
    fieldName: f.fieldName,
    type: f.type,
    required: f.required,
    roleId: f.roleId,
    position: { page: f.page, x: f.x, y: f.y, width: f.width, height: f.height },
    ...(f.placeholder ? { placeholder: f.placeholder } : {}),
  }));
}
