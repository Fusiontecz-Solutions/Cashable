export const DEFAULT_FUNDER_CONTRACT_LAYOUT_KEY = 'contract';
export const DEFAULT_FUNDER_CONTRACT_FILENAME = 'Contract.pdf';

export const FUNDER_SUPPLEMENTAL_LAYOUT_TYPES = [
  'flex_addendum',
  'pre_payment_addendum',
  'balance_transfer',
  'case_takeover_addendum',
  'ach_authorization',
  'ach_authorization_texas',
] as const;

export type FunderSupplementalLayoutType = (typeof FUNDER_SUPPLEMENTAL_LAYOUT_TYPES)[number];

export function funderContractLayoutKey(funderId: string): string {
  return `funder_${String(funderId || '').trim()}`;
}

export function funderSupplementalLayoutKey(
  funderId: string,
  supplementalType: string,
): string {
  const id = String(funderId || '').trim();
  const type = String(supplementalType || '').trim();
  return `funder_${id}_${type}`;
}

/** Standalone ACH uses the same stored PDF/coords as ach_authorization (except Texas). */
export function resolveFunderSupplementalStorageType(layoutKey: string): string {
  const key = String(layoutKey || '').trim();
  if (key === 'ach_authorization_standalone') return 'ach_authorization';
  if (key === 'ach_authorization_texas') return 'ach_authorization_texas';
  // Legacy uploads used case_takeover_balance_transfer — map to the separate addendum type.
  if (key === 'case_takeover_balance_transfer') return 'case_takeover_addendum';
  // Named addendum uploads (funder_<id>_addendum_<slug>) carry an addendum_ prefix
  // on the parsed supplemental type — the slug is the platform layout key
  // (e.g. addendum_coj_iowa → coj_iowa).
  if (key.startsWith('addendum_')) {
    return resolveFunderSupplementalStorageType(key.slice('addendum_'.length));
  }
  // Name-derived upload slugs → canonical layout keys.
  const CASHABLE_SLUG_ALIASES: Record<string, string> = {
    coj_ny_business_only: 'coj_ny_business',
    coj_ny_individual_only: 'coj_ny_merchant',
    coj_ny_merchant_only: 'coj_ny_merchant',
    waiver_of_personal_service: 'waiver_personal_service',
    waiver_of_personal_service_ny: 'waiver_personal_service',
    deposit_control_agreement_ny_tx: 'deposit_control_ny_tx',
    deposit_control_agreement_all_other_states: 'deposit_control',
    coj_iowa_cashable_fund_llc: 'coj_iowa',
  };
  if (CASHABLE_SLUG_ALIASES[key]) return CASHABLE_SLUG_ALIASES[key];
  return key;
}

export function funderSupplementalLayoutKeyForDocument(
  funderId: string,
  documentLayoutKey: string,
): string {
  return funderSupplementalLayoutKey(
    funderId,
    resolveFunderSupplementalStorageType(documentLayoutKey),
  );
}

export function funderDisclosureLayoutKey(funderId: string): string {
  return `funder_${String(funderId || '').trim()}_disclosure`;
}

export function funderDisclosureLayoutKeyForState(
  funderId: string,
  state: string,
  frequency: string,
): string {
  const id = String(funderId || '').trim();
  const stateToken = String(state || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  const freqToken = String(frequency || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  return `funder_${id}_disclosure_${stateToken}_${freqToken}`;
}

export function slugifyFunderDocumentToken(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function funderNamedAddendumLayoutKey(funderId: string, slug: string): string {
  const id = String(funderId || '').trim();
  const token = slugifyFunderDocumentToken(slug);
  return token ? `funder_${id}_addendum_${token}` : `funder_${id}_addendum`;
}

export function isFunderOwnedLayoutKey(
  layoutKey: string | null | undefined,
  funderId: string,
): boolean {
  const key = String(layoutKey || '').trim();
  const id = String(funderId || '').trim();
  if (!key || !id) return false;
  return key === funderContractLayoutKey(id) || key.startsWith(`funder_${id}_`);
}

export function parseFunderSupplementalLayoutKey(
  layoutKey: string,
): { funderId: string; supplementalType: string } | null {
  const key = String(layoutKey || '').trim();
  const match = /^funder_([0-9a-f-]{36})_(.+)$/i.exec(key);
  if (!match) return null;
  return { funderId: match[1], supplementalType: match[2] };
}

export function isFunderContractLayoutKey(layoutKey: string | null | undefined): boolean {
  const key = String(layoutKey || '').trim();
  if (!key.startsWith('funder_')) return false;
  return !parseFunderSupplementalLayoutKey(key);
}

export function isFunderSupplementalLayoutKey(layoutKey: string | null | undefined): boolean {
  return parseFunderSupplementalLayoutKey(String(layoutKey || '').trim()) != null;
}
