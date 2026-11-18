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
