/** DocuSign prefill styling — contract, ACH, and addendum templates all use Arial. */
export const DOCUSIGN_PREFILL_FONT = 'arial';
export const DOCUSIGN_PREFILL_FONT_COLOR = 'black';
/** Default prefill size across all docs (contract, addendum, ACH, disclosure). */
export const DOCUSIGN_PREFILL_FONT_SIZE = 'size10';

const DOCUSIGN_SIZE_TOKEN_RE = /^size(\d+)$/i;

/** Map a numeric pt or `sizeN` token to a DocuSign fontSize token. */
export function toDocuSignFontSizeToken(fontSize?: string | number): string | null {
  const raw = String(fontSize ?? '').trim();
  if (!raw) return null;
  const tokenMatch = DOCUSIGN_SIZE_TOKEN_RE.exec(raw);
  if (tokenMatch) {
    return `size${tokenMatch[1]}`;
  }
  const explicit = parseFloat(raw);
  if (!Number.isFinite(explicit) || explicit <= 0) return null;
  const rounded = Math.round(explicit);
  if (rounded <= 7) return 'size7';
  if (rounded === 8) return 'size8';
  if (rounded === 9) return 'size9';
  if (rounded === 10) return 'size10';
  if (rounded === 11) return 'size11';
  if (rounded === 12) return 'size12';
  if (rounded <= 14) return 'size14';
  if (rounded <= 16) return 'size16';
  if (rounded <= 18) return 'size18';
  if (rounded <= 22) return 'size22';
  if (rounded <= 24) return 'size24';
  if (rounded <= 26) return 'size26';
  if (rounded <= 28) return 'size28';
  if (rounded <= 32) return 'size32';
  if (rounded <= 36) return 'size36';
  if (rounded <= 42) return 'size42';
  if (rounded <= 48) return 'size48';
  if (rounded <= 54) return 'size54';
  if (rounded <= 60) return 'size60';
  if (rounded <= 66) return 'size66';
  return 'size72';
}

/**
 * Resolve DocuSign fontSize token.
 * All documents use size10; an explicit layout fontSize (pt or `sizeN`) wins.
 */
export function resolveDocuSignFontSizeToken(options?: {
  fontSize?: string | number;
  height?: string | number;
}): string {
  return toDocuSignFontSizeToken(options?.fontSize) || DOCUSIGN_PREFILL_FONT_SIZE;
}

/** @deprecated Size never derives from tab height any more; always size10. */
export function docuSignFontSizeFromTabHeight(_height?: string | number): string {
  return DOCUSIGN_PREFILL_FONT_SIZE;
}

/** Point size for flattened (burned) PDF text — 10pt everywhere; an explicit
 * layout fontSize (pt or `sizeN`) wins. */
export function docuSignPrefillFontSizePoints(options?: {
  fontSize?: string | number;
  height?: string | number;
}): number {
  const token = toDocuSignFontSizeToken(options?.fontSize);
  if (token) {
    const pt = parseFloat(token.replace(/^size/i, ''));
    if (Number.isFinite(pt) && pt > 0) return pt;
  }
  return 10;
}

export function applyDocuSignPrefillTabStyle<T extends Record<string, string | undefined>>(
  tab: T,
  options?: { height?: string | number; fontSize?: string | number },
): T & { font: string; fontColor: string; fontSize: string } {
  return {
    ...tab,
    font: DOCUSIGN_PREFILL_FONT,
    fontColor: DOCUSIGN_PREFILL_FONT_COLOR,
    fontSize: resolveDocuSignFontSizeToken(options),
  };
}

/** Ensure tab height can fit size9 — short boxes cause DocuSign to visually shrink text. */
export function resolveDocuSignPrefillTabHeight(height?: string | number): string {
  const h = parseFloat(String(height ?? '').trim());
  if (Number.isFinite(h) && h >= 19) return String(Math.round(h));
  return '19';
}

/** Phone / fax tabs — width hugs text; never cap to layout box (avoids 2-line wrap). */
export function isFitToTextPrefillVariable(variable?: string | null): boolean {
  const v = String(variable ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  if (!v) return false;
  return v.includes('phone') || v.includes('fax');
}

/** Approximate DocuSign text-tab width (px) so the field hugs prefilled content. */
export function docuSignTextTabWidthForValue(
  value: string,
  height?: string | number,
  fontSizePt?: string | number,
  options?: { variable?: string | null },
): string {
  const text = String(value || '').trim();
  if (!text) return '12';
  const token = toDocuSignFontSizeToken(fontSizePt);
  const fromToken = token ? parseFloat(token.replace(/^size/i, '')) : NaN;
  const explicit = parseFloat(String(fontSizePt ?? '').trim());
  const h = parseFloat(String(height ?? '19')) || 19;
  const fontSize =
    Number.isFinite(fromToken) && fromToken > 0
      ? fromToken
      : Number.isFinite(explicit) && explicit > 0
        ? explicit
        : 9;
  // Room for the value at the standard 10pt value size: values are mostly upper case, whose
  // Helvetica glyphs average ~0.66em (the old 9pt × 0.55 estimate was too narrow and made long
  // values shrink). Phones need slightly more room for () - and spaces.
  const sizeForWidth = Math.max(fontSize, 10);
  const pxPerChar = sizeForWidth * (isFitToTextPrefillVariable(options?.variable) ? 0.68 : 0.66);
  const fit = Math.ceil(text.length * pxPerChar) + 1;
  return String(Math.max(8, Math.min(fit, 360)));
}

/**
 * Width for a prefilled tab: fit to value length.
 * Layout `width` is only a max cap when set to a positive number; `auto` / omitted = fit only.
 */
export function resolveDocuSignPrefillTabWidth(options: {
  value: string;
  height?: string | number;
  layoutWidth?: string | number;
  fontSize?: string | number;
  variable?: string | null;
}): string {
  const configured = parseFloat(String(options.layoutWidth ?? '').trim());
  const text = String(options.value || '').trim();
  // A layout width is the printed blank: keep it whole. Hugging the value (the old Dropbox Sign
  // habit) under-sized long upper-case values, so they were shrunk and one page mixed 7pt and
  // 10pt values. Values now only get smaller when they are truly too long for the blank.
  if (Number.isFinite(configured) && configured > 0 && (!text || !isFitToTextPrefillVariable(options.variable))) {
    return String(configured);
  }
  const fit = docuSignTextTabWidthForValue(
    options.value,
    options.height,
    options.fontSize,
    { variable: options.variable },
  );
  if (
    isFitToTextPrefillVariable(options.variable) ||
    !Number.isFinite(configured) ||
    configured <= 0
  ) {
    return fit;
  }
  return String(Math.min(configured, parseFloat(fit) || configured));
}
