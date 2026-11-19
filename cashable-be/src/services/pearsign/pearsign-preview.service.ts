import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { fetchRemoteAssetBuffer } from '../cloudinaryInlinePreviewService';
import type { PearSignTemplate, PearSignTemplateField } from './pearsign-client';
import { pearSignHeightForFont, pearSignValueKey, type PearSignFieldStyle } from './pearsign-template-spec';

/**
 * Filled-contract preview (the "Review" step), built before anything is sent.
 *
 * PearSign has no draft/preview API, so the CRM draws the values itself: the
 * exact PDF that was uploaded to the PearSign template (PearSignTemplate.sourcePdfUrl)
 * gets every CRM value written at the template field's position. Signature /
 * initials boxes and the signer-completed fields are drawn as labelled boxes so
 * the reviewer sees where each party acts. Positions are PDF points, top-left origin.
 *
 * Ported from the Meridian implementation (meridian_backend pearsign-preview.service.ts).
 */

const SIGN_TYPES = new Set(['signature', 'initials']);
const MAX_FONT = 10;
const MIN_FONT = 5.5;
const PAD_X = 2;

type FieldPos = { page: number; x: number; y: number; width: number; height: number };

const TEXT_COLOR = rgb(0.05, 0.12, 0.45);
const SIGN_FILL = rgb(1, 0.96, 0.75);
const SIGN_BORDER = rgb(0.85, 0.65, 0.1);
const SIGNER_TEXT_FILL = rgb(0.9, 0.95, 1);
const SIGNER_TEXT_BORDER = rgb(0.45, 0.6, 0.9);

export class PearSignPreviewError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = 'PearSignPreviewError';
  }
}

const pdfCache = new Map<string, { at: number; buf: Buffer }>();
const PDF_TTL_MS = 30 * 60_000;

/**
 * Seed the base-PDF cache with bytes we already hold (e.g. the package merged during
 * staging) so the first Review preview does not re-download it from Cloudinary.
 */
export function primeBasePdfCache(url: string | null | undefined, buf: Buffer): void {
  const key = String(url || '').trim();
  if (!key || !buf?.length) return;
  const now = Date.now();
  for (const [k, v] of pdfCache) if (now - v.at >= PDF_TTL_MS) pdfCache.delete(k);
  pdfCache.set(key, { at: now, buf });
}

async function loadBasePdf(url: string | null | undefined): Promise<Buffer> {
  const key = String(url || '').trim();
  if (!key) {
    throw new PearSignPreviewError('The PearSign template has no source PDF recorded, so a preview cannot be built.', 404);
  }
  const hit = pdfCache.get(key);
  if (hit && Date.now() - hit.at < PDF_TTL_MS) return hit.buf;
  try {
    const buf = await fetchRemoteAssetBuffer(key);
    pdfCache.set(key, { at: Date.now(), buf });
    return buf;
  } catch (err) {
    throw new PearSignPreviewError(`Could not download the funder contract PDF: ${(err as Error)?.message || 'unknown error'}`);
  }
}

/** Helvetica only encodes WinAnsi; swap anything else for a close ASCII character. */
function encodable(font: PDFFont, text: string): string {
  const mapped = text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[\r\n\t]+/g, ' ');
  let out = '';
  for (const ch of mapped) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += '?';
    }
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest layout (font size + lines) that fits the box; shrinks, then wraps. A chosen size is kept as is. */
function layout(font: PDFFont, text: string, box: FieldPos, fontSize?: number): { size: number; lines: string[] } {
  const width = Math.max(4, box.width - PAD_X * 2);
  if (fontSize) {
    return { size: fontSize, lines: font.widthOfTextAtSize(text, fontSize) <= width ? [text] : wrap(font, text, fontSize, width) };
  }
  const start = Math.min(MAX_FONT, Math.max(MIN_FONT, box.height * 0.7));
  for (let size = start; size >= MIN_FONT; size -= 0.5) {
    if (font.widthOfTextAtSize(text, size) <= width) return { size, lines: [text] };
  }
  for (let size = start; size >= MIN_FONT; size -= 0.5) {
    const lines = wrap(font, text, size, width);
    if (lines.length * size * 1.1 <= box.height + 1) return { size, lines };
  }
  return { size: MIN_FONT, lines: wrap(font, text, MIN_FONT, width) };
}

function drawValue(page: PDFPage, font: PDFFont, raw: string, box: FieldPos, fontSize?: number) {
  const text = encodable(font, raw.trim());
  if (!text) return;
  const pageHeight = page.getHeight();
  const { size, lines } = layout(font, text, box, fontSize);
  const lineHeight = size * 1.1;
  const blockHeight = lines.length * lineHeight;
  const boxBottom = pageHeight - box.y - box.height;
  let baseline = boxBottom + (box.height + blockHeight) / 2 - size * 0.95;
  for (const line of lines) {
    page.drawText(line, { x: box.x + PAD_X, y: baseline, size, font, color: TEXT_COLOR });
    baseline -= lineHeight;
  }
}

function drawBox(
  page: PDFPage,
  font: PDFFont,
  label: string,
  box: FieldPos,
  colors: { fill: ReturnType<typeof rgb>; border: ReturnType<typeof rgb> },
) {
  const y = page.getHeight() - box.y - box.height;
  page.drawRectangle({
    x: box.x,
    y,
    width: box.width,
    height: box.height,
    color: colors.fill,
    opacity: 0.55,
    borderColor: colors.border,
    borderWidth: 0.6,
    borderOpacity: 0.9,
  });
  const text = encodable(font, label);
  const size = Math.max(
    4,
    Math.min(7, box.height * 0.45, (box.width - 4) / Math.max(1, font.widthOfTextAtSize(text, 1))),
  );
  page.drawText(text, {
    x: box.x + 2,
    y: y + (box.height - size) / 2 + size * 0.15,
    size,
    font,
    color: rgb(0.3, 0.25, 0.1),
  });
}

export function pearSignFieldPos(f: PearSignTemplateField, pageCount: number): FieldPos | null {
  const p = f.position;
  const page = Number(p?.page);
  const x = Number(p?.x);
  const y = Number(p?.y);
  const width = Number(p?.width);
  const height = Number(p?.height);
  if (![page, x, y, width, height].every(Number.isFinite)) return null;
  if (page < 1 || page > pageCount || width <= 0 || height <= 0) return null;
  return { page, x, y, width, height };
}

/**
 * Build the filled preview PDF. `values` are keyed by layout variable (base key).
 * `signerFilledNames` are the template fields the signer completes (fill-at-signing),
 * drawn as boxes instead of values.
 */
export async function buildPearSignPreviewPdf(input: {
  template: PearSignTemplate;
  sourcePdfUrl: string | null;
  values: Record<string, string>;
  signerFilledNames: Set<string>;
  /** Value key for a field (default: pearSignValueKey — layout variable, or own key for independent fields). Packages key per document. */
  valueKeyFor?: (fieldName: string) => string;
  /** Review font sizes, keyed like `values`; the box grows to fit, as PearSign requires. */
  styles?: Record<string, PearSignFieldStyle>;
  title: string;
}): Promise<{ pdf: Buffer; filledFieldCount: number }> {
  const base = await loadBasePdf(input.sourcePdfUrl);
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(base, { ignoreEncryption: true });
  } catch {
    throw new PearSignPreviewError('The funder contract PDF could not be read.');
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  const roleName = new Map(input.template.signerRoles.map((r) => [r.roleId, r.name]));

  let filled = 0;
  for (const f of input.template.fields ?? []) {
    const box = pearSignFieldPos(f, pages.length);
    if (!box) continue;
    const page = pages[box.page - 1];
    const who = roleName.get(f.roleId) || f.roleName || '';
    if (SIGN_TYPES.has(f.type)) {
      drawBox(page, bold, `${f.type === 'initials' ? 'Initial' : 'Sign'}${who ? ` - ${who}` : ''}`, box, {
        fill: SIGN_FILL,
        border: SIGN_BORDER,
      });
      continue;
    }
    if (input.signerFilledNames.has(f.fieldName)) {
      drawBox(page, font, `${who || 'Signer'} completes`, box, { fill: SIGNER_TEXT_FILL, border: SIGNER_TEXT_BORDER });
      continue;
    }
    const key = input.valueKeyFor ? input.valueKeyFor(f.fieldName) : pearSignValueKey(f.fieldName);
    const v = String(input.values[key] ?? '').trim();
    if (!v) continue;
    const fontSize = input.styles?.[key]?.fontSize;
    drawValue(page, font, v, { ...box, height: pearSignHeightForFont(box.height, fontSize) }, fontSize);
    filled++;
  }

  doc.setTitle(input.title);
  doc.setProducer('Cashable CRM PearSign preview');
  return { pdf: Buffer.from(await doc.save()), filledFieldCount: filled };
}
