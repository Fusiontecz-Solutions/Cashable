/**
 * A CRM value by its variable name. Package sends store values per document
 * (`d1__client_legal_name`, `d2__purchase_amount`); single-contract sends store them plainly
 * (`client_legal_name`). Returns the first non-empty one (COJ inputs are skipped).
 */
export function crmValue(values: Record<string, unknown> | null | undefined, variable: string): string {
  if (!values) return '';
  const direct = String(values[variable] ?? '').trim();
  if (direct) return direct;
  const suffix = `__${variable}`;
  for (const [k, v] of Object.entries(values)) {
    if (!k.endsWith(suffix) || /__coj\d+__/.test(k)) continue;
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

/** "$25,000.00" from a CRM amount ("25000", "$25,000"), or "" when not a number. */
export function crmMoney(raw: string): string {
  const n = parseFloat(String(raw || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
}
