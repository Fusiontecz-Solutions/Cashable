import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { DocumentLayoutPlacement } from './convert-docusign-template-export';
import { fullUsStateName } from '../../../utils/usStateNames';

/**
 * Confessions of judgment typed out like a filed court document: every CRM value is written into
 * its sentence in bold (no blanks or boxes), justified Times paragraphs, one PDF per send.
 * Signature / initial spots come back as layout placements at the exact spots drawn here.
 */

export type CojKind = 'coj_iowa' | 'coj_ny_business' | 'coj_ny_general' | 'coj_ny_merchant';

const COJ_KINDS: CojKind[] = ['coj_iowa', 'coj_ny_business', 'coj_ny_general', 'coj_ny_merchant'];

/** Which typed COJ a layout is (platform key, funder-scoped key or its PDF name), or null. */
export function typedCojKind(layout: { key?: string; pdf?: { fileName?: string }; document?: { originalFileName?: string } }): CojKind | null {
  const candidates = [layout.key, layout.pdf?.fileName, layout.document?.originalFileName].map((s) =>
    String(s || '').toLowerCase().replace(/\.pdf$/, ''),
  );
  for (const c of candidates) {
    for (const kind of COJ_KINDS) if (c === kind || c.endsWith(`_${kind}`)) return kind;
  }
  // Uploaded NY COJ templates named by their form ("coj_ny_individual_only", "COJ - NY Business only").
  for (const c of candidates) {
    const k = c.replace(/[^a-z0-9]+/g, '_');
    if (!/(^|_)coj(_|$)/.test(k) || !/(^|_)ny(_|$)|new_york/.test(k)) continue;
    if (/individual|merchant/.test(k)) return 'coj_ny_merchant';
    if (/business/.test(k)) return 'coj_ny_business';
    return 'coj_ny_general';
  }
  return null;
}

/**
 * New York COJs are PDF only: filled in the CRM, downloaded and emailed by hand. They are never
 * sent for e-signature (BoldSign or any other provider).
 */
export function isNewYorkCojLayout(layout: { key?: string; name?: string; pdf?: { fileName?: string }; document?: { originalFileName?: string } }): boolean {
  const kind = typedCojKind(layout) ?? typedCojKind({ key: layout.name });
  return Boolean(kind && kind.startsWith('coj_ny'));
}

// ---------- values ----------

type Values = Record<string, string | undefined>;

const NBSP = '\u00A0';

/**
 * A CRM value as typed, keeping extra spaces: "REP,   PEOPLEFIRST" prints with the wider gap.
 * Line breaks become spaces; one leading/trailing space is dropped; every space beyond the first
 * in a run (and any further leading ones) becomes a non-breaking space glued to the next word,
 * so justification never squeezes or stretches it away.
 */
export function cojKeepSpaces(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/^ /, '')
    .replace(/ +$/, '')
    .replace(/^ +/, (m) => NBSP.repeat(m.length))
    .replace(/ {2,}/g, (m) => ' ' + NBSP.repeat(m.length - 1));
}

const v = (values: Values, ...keys: string[]) => {
  for (const k of keys) {
    const s = cojKeepSpaces(values[k]);
    if (s.trim()) return s;
  }
  return '';
};
const upper = (s: string) => s.toUpperCase();
/** An address on one tidy line: single spaces (typed doubles dropped) and ", " between parts. */
export const oneLineAddress = (s: string) =>
  String(s ?? '')
    .replace(/[\s\u00A0]+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(,\s*)+,/g, ',')
    .replace(/^[\s,]+|[\s,]+$/g, '');

function money(raw: string): string {
  const n = parseFloat(String(raw || '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return '';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseDate(raw: string): Date | null {
  const s = String(raw || '').trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

function longDate(raw: string): string {
  const d = parseDate(raw);
  return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : raw;
}

/** What every COJ prints, resolved from the CRM values once. */
/** Blank width (pt) of each field in the fillable COJ forms. */
const FILLABLE_FIELD_WIDTH: Record<string, number> = {
  PLAINTIFF: 170,
  MERCHANT_NAME: 235,
  OWNER_NAME: 170,
  OWNER_ADDRESS: 265,
  BUSINESS_ADDRESS: 265,
  STATE: 110,
  OWNER_COUNTY: 110,
  BUSINESS_COUNTY: 110,
  REPAYMENT_AMOUNT: 90,
  JUDGMENT_TOTAL: 90,
  AGREEMENT_DATE: 125,
  COJ_DATE: 90,
  DAY: 38,
  MONTH: 80,
  YEAR: 42,
};
/** "{{NAME}}" (optionally followed by punctuation) in a fillable COJ: a blank with a form field. */
const FILLABLE_TOKEN = /^\{\{([A-Z_]+)\}\}([^A-Za-z0-9{]*)$/;

/** Company suffixes that belong to the name before the comma ("FORGOTTEN COAST FISHING, INC."). */
const ENTITY_SUFFIX = /^(inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|llp|l\.l\.p|lp|l\.p|pllc|pc|p\.c|pa|p\.a|na|n\.a|plc|gmbh)\.?$/i;

/**
 * Typed "Additional names": one entity per ";" or line, and also per comma ("ABC, XYZ, YTV" is three
 * entities) — except a company suffix after a comma, which stays with its name ("XYZ, INC.").
 */
export function splitEntityNames(raw: string): string[] {
  const out: string[] = [];
  for (const part of String(raw ?? '').split(/[;\r\n]+/)) {
    for (const piece of part.split(',')) {
      const name = piece.trim();
      if (!name) continue;
      if (ENTITY_SUFFIX.test(name) && out.length) out[out.length - 1] = `${out[out.length - 1]}, ${name}`;
      else out.push(name);
    }
  }
  return out;
}

/**
 * The merchant's name as the COJ prints it: legal name and DBAs exactly as entered (upper case).
 * DBA separators are the team's own; the COJ adds "and" only before the last additional entity.
 */
const cojBusinessName = (values: Values) =>
  upper(v(values, 'business_name_with_dba', 'client_legal_name', 'disclosure_merchant_name'));

export function cojFacts(values: Values) {
  // Fillable form (renderFillableCoj): every value is a named blank.
  if (String(values.__fillable ?? '') === '1') {
    const base = cojFactsFrom({
      business_name_with_dba: '{{MERCHANT_NAME}}',
      owner1_guarantor_name: '{{OWNER_NAME}}',
      funder_name: '{{PLAINTIFF}}',
      owner_county: '{{OWNER_COUNTY}}',
      business_county: '{{BUSINESS_COUNTY}}',
      guarantor_address_full: '{{OWNER_ADDRESS}}',
      business_address_full: '{{BUSINESS_ADDRESS}}',
    });
    return {
      ...base,
      ownerState: '{{STATE}}',
      purchase: '{{REPAYMENT_AMOUNT}}',
      judgment: '{{JUDGMENT_TOTAL}}',
      agreementDate: '{{AGREEMENT_DATE}}',
      cojDate: '{{COJ_DATE}}',
      dayOrdinal: '{{DAY}}',
      month: '{{MONTH}}',
      year: '{{YEAR}}',
      merchantAnd: '{{MERCHANT_NAME}}',
    };
  }
  return cojFactsFrom(values);
}

/** Names print with one space after every comma ("CORPORATION,COZY" → "CORPORATION, COZY"). */
export function cojNameCommas(raw: unknown): string {
  return String(raw ?? '').replace(/,(?=[^\s ])/g, ', ');
}
const COJ_NAME_KEYS = [
  'business_name_with_dba',
  'client_legal_name',
  'disclosure_merchant_name',
  'coj_additional_names',
  'owner1_guarantor_name',
  'guaranty_owner1_name',
  'client_name',
] as const;

function cojFactsFrom(rawValues: Values) {
  const values: Values = { ...rawValues };
  for (const k of COJ_NAME_KEYS) if (values[k] != null) values[k] = cojNameCommas(values[k]);
  // Additional names follow the merchant everywhere: every Exhibit A company of the deal (added or
  // removed there, it follows here), then any typed in this COJ's "Additional names" (";" or new
  // lines). Duplicates and the merchant's own name are dropped.
  const mainName = cojBusinessName(values);
  const own = new Set(
    [mainName, upper(v(values, 'client_legal_name')), upper(v(values, 'doing_business_as'))]
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  );
  const exhibitNames = Array.from({ length: 10 }, (_, i) => String(values[`exhibit_a_value_${i + 1}`] ?? ''));
  const seen = new Set<string>();
  const extraNames = [...exhibitNames, ...splitEntityNames(String(values.coj_additional_names ?? ''))]
    .map((s) => upper(cojKeepSpaces(cojNameCommas(s))))
    .filter((s) => {
      const key = s.replace(/[\s\u00A0]+/g, ' ').trim();
      if (!key || own.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const merchant = [cojBusinessName(values), ...extraNames]
    .filter(Boolean)
    .join(', ');
  const owner = upper(v(values, 'owner1_guarantor_name', 'guaranty_owner1_name', 'client_name'));
  // COJs confess the REPAYMENT (RTR / purchase price, e.g. $34,100.00), never the funded amount
  // ($22,000.00). The funded amount is only a last resort when no repayment is known.
  const purchase =
    money(v(values, 'coj_repayment_amount', 'purchase_price', 'total_repayment_amount', 'disclosure_total_payment')) ||
    money(v(values, 'purchase_amount'));
  const num = (s: string) => parseFloat(String(s || '').replace(/[^0-9.]/g, ''));
  // Judgment = repayment + $7,500. A saved total that was derived from the funded amount
  // (funded + 7,500, the old rule) is ignored; any other typed total is kept.
  let judgment = money(v(values, 'coj_sum_with_default'));
  const funded = num(v(values, 'purchase_amount'));
  if (judgment && Number.isFinite(funded) && Math.abs(num(judgment) - (funded + 7500)) < 0.01 && Math.abs(num(purchase) - funded) >= 0.01) {
    judgment = '';
  }
  if (!judgment && purchase) judgment = money(String(num(purchase) + 7500));
  const date = parseDate(v(values, 'agreement_date', 'signature_date'));
  const bold = cojBoldGroups(values.coj_bold);
  /** A CRM value in the text: bold unless its group was switched off. */
  const V = (group: CojBoldGroup, text: string): Run => ({ text, bold: bold.has(group) });
  return {
    V,
    isBold: (group: CojBoldGroup) => bold.has(group),
    /** Business name followed by the additional names, each with its own weight. */
    /** `and: true` joins the last two names with "and" ("A, B, C and D") for sentences that list them. */
    M: (opts: { and?: boolean } = {}): Run[] => {
      const main = cojBusinessName(values);
      if (opts.and && main && extraNames.length) {
        if (extraNames.length === 1) return [V('merchant', main), R(' and '), V('additional', extraNames[0])];
        const head = extraNames.slice(0, -1).join(', ');
        return [V('merchant', `${main},`), R(' '), V('additional', head), R(' and '), V('additional', extraNames[extraNames.length - 1])];
      }
      // The comma stays on the name before it, so a line never starts with ",".
      const runs: Run[] = main ? [V('merchant', extraNames.length ? `${main},` : main)] : [];
      if (extraNames.length) runs.push(...(runs.length ? [R(' ')] : []), V('additional', extraNames.join(', ')));
      return runs;
    },
    extraNames,
    plaintiff: upper(v(values, 'funder_name')) || 'CASHABLE FUND LLC',
    merchant,
    /** "A, B AND C": business name then the additional names, for the signature block. */
    merchantAnd: (() => {
      const names = [cojBusinessName(values), ...extraNames].filter((n) => n.trim());
      return names.length > 1 ? `${names.slice(0, -1).join(', ')} AND ${names[names.length - 1]}` : names.join('');
    })(),
    owner,
    ownerState: upper(fullUsStateName(v(values, 'owner_state'))),
    ownerCounty: upper(v(values, 'owner_county')),
    ownerAddress: upper(oneLineAddress(v(values, 'guarantor_address_full', 'mailing_address_full'))),
    businessAddress: upper(oneLineAddress(v(values, 'business_address_full'))),
    businessCounty: upper(v(values, 'business_county', 'owner_county')),
    purchase,
    judgment,
    agreementDate: upper(longDate(v(values, 'agreement_date', 'signature_date'))),
    /** "Date:" under the signature block (COJ mapping / Review "COJ date"; default the agreement date). */
    cojDate: (() => {
      const raw = v(values, 'coj_date', 'agreement_date', 'signature_date').trim();
      const d = parseDate(raw);
      return d ? `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}` : raw;
    })(),
    dayOrdinal: date ? upper(ordinal(date.getDate())) : '',
    month: date ? upper(MONTHS[date.getMonth()]) : '',
    year: date ? String(date.getFullYear()) : '',
  };
}

// ---------- bold ----------

/** Value groups whose bold print can be switched off per COJ (Review → "Bold text"). */
export const COJ_BOLD_GROUPS = [
  ['plaintiff', 'Plaintiff'],
  ['merchant', 'Business name'],
  ['additional', 'Additional names'],
  ['owner', 'Owner name'],
  ['owner_address', 'Owner address'],
  ['business_address', 'Business address'],
  ['state', 'State'],
  ['county', 'County'],
  ['purchase', 'Purchased amount'],
  ['judgment', 'Judgment total'],
  ['date', 'Dates'],
] as const;
/** Groups of the first version of this setting, still accepted in saved values. */
const COJ_BOLD_LEGACY: Record<string, string[]> = {
  address: ['owner_address', 'business_address'],
  place: ['state', 'county'],
  amount: ['purchase', 'judgment'],
};
export type CojBoldGroup = (typeof COJ_BOLD_GROUPS)[number][0];
/** Every group bold (the filed-court look), the default. */
export const COJ_BOLD_ALL = COJ_BOLD_GROUPS.map(([g]) => g).join(',');

const NEW_ONLY = new Set(['additional', 'owner_address', 'business_address', 'state', 'county', 'purchase', 'judgment']);

/** "merchant,owner" → those groups bold; empty/unset → all bold; "none" → none. */
/** Default look: every filled value bold (names, addresses, venue, amounts and dates). */
export const COJ_BOLD_DEFAULT: string[] = COJ_BOLD_GROUPS.map(([g]) => g as string);

export function cojBoldGroups(raw: unknown): Set<string> {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return new Set(COJ_BOLD_DEFAULT);
  const ids = s.split(/[\s,;]+/).filter(Boolean);
  // A value saved by the first version (7 groups): "merchant" covered the additional names too.
  const legacy = ids.some((g) => g in COJ_BOLD_LEGACY) || (ids.includes('merchant') && !ids.some((g) => NEW_ONLY.has(g)));
  const out = new Set<string>();
  for (const g of ids) for (const x of COJ_BOLD_LEGACY[g] ?? [g]) if (COJ_BOLD_GROUPS.some(([k]) => k === x)) out.add(x);
  if (legacy && out.has('merchant')) out.add('additional');
  return out;
}

// ---------- line spacing ----------

/** Line spacing choices for the COJ paragraphs (Review / mapping → "Line spacing"). */
export const COJ_LINE_SPACINGS = [
  ['normal', 'Normal', 1],
  ['more', 'More (+15%)', 1.15],
  ['wide', 'Wide (+30%)', 1.3],
  ['double', 'Double', 1.6],
] as const;

export function cojLineSpacingFactor(raw: unknown): number {
  const s = String(raw ?? '').trim().toLowerCase();
  return COJ_LINE_SPACINGS.find(([k]) => k === s)?.[2] ?? 1;
}

// ---------- tiny typesetter ----------

type Run = { text: string; bold?: boolean };
const R = (text: string): Run => ({ text });
const B = (text: string): Run => ({ text, bold: true });

const PAGE_W = 612;
const PAGE_H = 792;
const LEFT = 54;
const RIGHT = 558;
const BODY = 11.5;
const LEADING = 19;
const BOTTOM = 92; // keep clear of the footer (initials)

/** Characters the standard Times font cannot draw become close equivalents. */
function encodable(s: string): string {
  return String(s ?? '')
    .replace(/[‐-–]/g, '-')
    .replace(/—/g, '-')
    .replace(/[^\x20-\x7E -ÿ‘’“”•…]/g, '');
}

class Typesetter {
  doc!: PDFDocument;
  regular!: PDFFont;
  bold!: PDFFont;
  page!: PDFPage;
  pages: PDFPage[] = [];
  y = 0; // distance from the top of the page to the current baseline
  marks: Array<{ kind: 'signature' | 'initial'; page: number; x: number; y: number }> = [];
  /** Fillable form only: where each "{{NAME}}" blank was drawn (PDF coordinates). */
  fields: Array<{ name: string; page: number; x: number; y: number; w: number; h: number }> = [];

  /** Body size / line spacing (shrunk by `scale` when a COJ must keep its page count). */
  body = BODY;
  leading = LEADING;

  constructor(
    readonly opts: {
      footer?: (t: Typesetter, pageNo: number) => void;
      scale?: number;
      spacing?: number;
      /** Sans-serif (Helvetica) instead of Times, with its own body size / line height (NY COJs). */
      sans?: { body: number; leading: number };
    },
  ) {
    const k = opts.scale ?? 1;
    this.body = Math.round((opts.sans?.body ?? BODY) * k * 4) / 4;
    this.leading = Math.round((opts.sans?.leading ?? LEADING) * k * (opts.spacing ?? 1) * 4) / 4;
  }

  async init() {
    this.doc = await PDFDocument.create();
    this.regular = await this.doc.embedFont(this.opts.sans ? StandardFonts.Helvetica : StandardFonts.TimesRoman);
    this.bold = await this.doc.embedFont(this.opts.sans ? StandardFonts.HelveticaBold : StandardFonts.TimesRomanBold);
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = 72;
  }

  font(bold?: boolean) {
    return bold ? this.bold : this.regular;
  }

  width(text: string, bold: boolean | undefined, size: number) {
    const field = FILLABLE_TOKEN.exec(text);
    if (field) return (FILLABLE_FIELD_WIDTH[field[1]] ?? 120) * (size / BODY) + this.font(bold).widthOfTextAtSize(encodable(field[2]), size);
    // Letter by letter: the width as drawn. (The font's own measure applies kerning, which drawText
    // does not, so words such as "STATE" or "MATVEY" printed wider than measured and closed the gap.)
    const font = this.font(bold);
    let w = 0;
    for (const ch of encodable(text)) w += font.widthOfTextAtSize(ch, size);
    return w;
  }

  draw(text: string, x: number, baseline: number, opts: { bold?: boolean; size?: number } = {}) {
    const field = FILLABLE_TOKEN.exec(text);
    if (field) {
      const size = opts.size ?? this.body;
      const w = (FILLABLE_FIELD_WIDTH[field[1]] ?? 120) * (size / BODY);
      this.page.drawLine({ start: { x, y: PAGE_H - baseline - 2 }, end: { x: x + w, y: PAGE_H - baseline - 2 }, thickness: 0.5, color: rgb(0, 0, 0) });
      this.fields.push({ name: field[1], page: this.pages.indexOf(this.page), x, y: PAGE_H - baseline - 2.5, w, h: size + 4 });
      if (field[2]) this.draw(field[2], x + w, baseline, opts);
      return;
    }
    const t = encodable(text);
    if (!t) return;
    this.page.drawText(t, { x, y: PAGE_H - baseline, size: opts.size ?? this.body, font: this.font(opts.bold), color: rgb(0, 0, 0) });
  }

  line(x1: number, x2: number, baseline: number, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y: PAGE_H - baseline }, end: { x: x2, y: PAGE_H - baseline }, thickness, color: rgb(0, 0, 0) });
  }

  ensure(space: number) {
    if (this.y + space > PAGE_H - BOTTOM) {
      this.newPage();
    }
  }

  /**
   * A paragraph of mixed regular/bold runs, word-wrapped between `left` and `right` and justified
   * (last line left-aligned). `indent` is extra space on the first line.
   */
  paragraph(
    runs: Run[],
    o: { left?: number; right?: number; indent?: number; size?: number; leading?: number; align?: 'justify' | 'left' | 'center'; gapAfter?: number } = {},
  ) {
    const left = o.left ?? LEFT;
    const right = o.right ?? RIGHT;
    const size = o.size ?? this.body;
    const leading = o.leading ?? this.leading;
    const align = o.align ?? 'justify';
    // Words keep their run's weight; a bold run's words stay bold across lines.
    type Word = { text: string; bold?: boolean; w: number; spaceBefore: boolean };
    const words: Word[] = [];
    // A space at the end of one run separates it from the next run's first word.
    let pendingSpace = false;
    for (const [ri, run] of runs.entries()) {
      let text = encodable(run.text);
      // "…ASSOCIATES, P.A." + "." → one period.
      if (ri > 0 && /\.\s*$/.test(runs[ri - 1].text) && text.startsWith('.')) text = text.slice(1);
      // Only ordinary spaces separate words; a non-breaking space (an extra typed space) stays
      // with its word so the gap prints as typed.
      const parts = text.split(/([ \t\r\n]+)/);
      for (const part of parts) {
        if (!part) continue;
        if (/^[ \t\r\n]+$/.test(part)) {
          pendingSpace = true;
          continue;
        }
        words.push({ text: part, bold: run.bold, w: this.width(part, run.bold, size), spaceBefore: pendingSpace && words.length > 0 });
        pendingSpace = false;
      }
    }
    const space = this.width(' ', false, size);
    const lines: Word[][] = [];
    let cur: Word[] = [];
    let curW = 0;
    for (const word of words) {
      const lineMax = right - left - (lines.length === 0 ? (o.indent ?? 0) : 0);
      const add = (cur.length && word.spaceBefore ? space : 0) + word.w;
      if (cur.length && curW + add > lineMax) {
        lines.push(cur);
        cur = [{ ...word, spaceBefore: false }];
        curW = word.w;
      } else {
        cur.push(word);
        curW += add;
      }
    }
    if (cur.length) lines.push(cur);

    lines.forEach((line, i) => {
      this.ensure(0);
      const x0 = left + (i === 0 ? (o.indent ?? 0) : 0);
      const avail = right - x0;
      const natural = line.reduce((s, w, k) => s + w.w + (k > 0 && w.spaceBefore ? space : 0), 0);
      const gaps = line.filter((w, k) => k > 0 && w.spaceBefore).length;
      const last = i === lines.length - 1;
      let extra = 0;
      let x = x0;
      if (align === 'justify' && !last && gaps > 0) {
        // Justify only while the gaps stay even; a line that would need big holes (a few long
        // words, e.g. an address) stays left-aligned instead.
        const stretch = (avail - natural) / gaps;
        extra = stretch <= space * 2 ? stretch : 0;
      }
      if (align === 'center') x = left + (right - left - natural) / 2;
      line.forEach((w, k) => {
        if (k > 0 && w.spaceBefore) x += space + extra;
        this.draw(w.text, x, this.y, { bold: w.bold, size });
        x += w.w;
      });
      this.y += leading;
    });
    this.y += o.gapAfter ?? 0;
  }

  /** Signature line with a PearSign signature spot just above it. */
  signatureLine(label: string, x: number, width: number) {
    this.ensure(40);
    this.y += 16;
    this.draw(label, x, this.y);
    const lx = x + this.width(label, false, this.body) + 2;
    this.line(lx, lx + width, this.y + 1);
    this.marks.push({ kind: 'signature', page: this.pages.length, x: lx + 4, y: this.y - 20 });
    this.y += 22;
  }

  async finish() {
    this.pages.forEach((page, i) => {
      this.page = page;
      this.opts.footer?.(this, i + 1);
    });
    return Buffer.from(await this.doc.save());
  }
}

// ---------- shared blocks ----------

function caption(
  t: Typesetter,
  o: {
    court: Array<string | Run[]>;
    plaintiff: string;
    defendants: Run[];
    rightTitle: string;
    venueState: string;
    venueCounty: string;
    ss?: boolean;
    /** Which value groups print bold (Review → "Bold text"); all when unset. */
    isBold?: (group: CojBoldGroup) => boolean;
    /** Court lines left-aligned in regular type (NY General form) instead of centred bold. */
    courtLeft?: boolean;
  },
) {
  const bold = (g: CojBoldGroup) => o.isBold?.(g) ?? true;
  t.y = 70;
  for (const line of o.court) {
    const runs = Array.isArray(line) ? line : [o.courtLeft ? R(line) : B(line)];
    t.paragraph(runs, { align: o.courtLeft ? 'left' : 'center', leading: 14 });
  }
  const top = t.y + 4;
  const boxRight = 316;
  t.line(LEFT - 4, boxRight, top);
  // Right column.
  t.draw(o.rightTitle, 336, top + 14);
  t.draw('AFFIDAVIT OF', 336, top + 46, { bold: true });
  t.draw('CONFESSION OF JUDGMENT', 336, top + 60, { bold: true });
  // Left column.
  t.y = top + 22;
  t.paragraph([{ text: o.plaintiff, bold: bold('plaintiff') }], { left: LEFT, right: boxRight - 6, align: 'left', leading: 14 });
  t.y += 6;
  t.draw('Plaintiff,', 166, t.y);
  t.y += 26;
  t.draw('-against-', 166, t.y);
  t.y += 28;
  t.paragraph(o.defendants, { left: LEFT, right: boxRight - 6, align: 'left', leading: 14 });
  t.y += 14; // one blank line between the defendant names and "Defendants."
  t.draw('Defendants.', 236, t.y);
  t.line(LEFT - 4, boxRight, t.y + 6);
  t.y += 26;
  // Venue.
  const venue = (label: string, value: string, group: CojBoldGroup, extra = '') => {
    t.draw(label, LEFT - 4, t.y);
    const x = LEFT - 4 + t.width(label, false, t.body) + 4;
    t.draw(value || '_____________', x, t.y, { bold: Boolean(value) && bold(group) });
    t.draw(`)${extra}`, 272, t.y);
    t.y += 22;
  };
  venue('STATE OF', o.venueState, 'state');
  t.draw(o.ss ? ')  ss.:' : ')', 272, t.y - 11);
  t.y += 6;
  venue('COUNTY OF', o.venueCounty, 'county');
  t.y += 8;
}

const NUM_INDENT = 24;
const numbered = (t: Typesetter, n: number, runs: Run[]) => t.paragraph([R(`${n}.  `), ...runs], { indent: NUM_INDENT });
const indented = (t: Typesetter, runs: Run[]) => t.paragraph(runs, { indent: NUM_INDENT });

function initialsFooter(t: Typesetter, pageNo: number, withSpot: boolean, label = 'Initial Here:') {
  const base = PAGE_H - 46;
  const lineX = RIGHT - 70;
  t.draw(label, lineX - t.width(label, false, 9) - 4, base, { size: 9 });
  t.line(lineX, RIGHT, base + 1);
  if (withSpot) t.marks.push({ kind: 'initial', page: pageNo, x: lineX + 12, y: base - 13 });
}

function notaryBlock(t: Typesetter, title: string, body: Run[]) {
  t.ensure(150);
  t.y += 10;
  t.paragraph([B(title)], { align: 'left', leading: 22 });
  t.paragraph(body);
  t.y += 30;
  t.ensure(60);
  t.line(LEFT, LEFT + 230, t.y);
  t.line(336, RIGHT, t.y);
  t.y += 12;
  t.draw('NOTARY PUBLIC (SIGNATURE)', LEFT, t.y, { size: 9 });
  t.draw(title.startsWith('N') ? 'MY COMMISSION EXPIRES ON' : 'COMMISSION EXPIRES', 336, t.y, { size: 9 });
  t.y += 40;
  t.draw('NOTARY SEAL', 456, t.y, { size: 9 });
}

// ---------- the four COJs ----------

async function iowa(values: Values, scale = 1) {
  const f = cojFacts(values);
  const t = new Typesetter({ footer: (tt, n) => initialsFooter(tt, n, true), scale, spacing: cojLineSpacingFactor(values.coj_line_spacing) });
  await t.init();
  caption(t, {
    isBold: f.isBold,
    court: ['IOWA DISTRICT COURT', 'COUNTY OF BLACK HAWK'],
    plaintiff: f.plaintiff,
    defendants: [...f.M(), R(' and '), f.V('owner', f.owner)],
    rightTitle: 'Civil Case No.',
    venueState: f.ownerState,
    venueCounty: f.ownerCounty,
  });
  t.paragraph([f.V('owner', f.owner), R(', being duly sworn, deposes and says:')], { align: 'left', gapAfter: 4 });
  // The businesses only (the "Merchant Defendant"), "and" before the last one: "A, B and C".
  numbered(t, 1, [
    R('I am a principal, owner, and an officer of '),
    ...f.M({ and: true }),
    R(' (“Merchant Defendant”), and as such, I have the authority to act on behalf of Merchant Defendant.'),
  ]);
  numbered(t, 2, [R('I reside at '), f.V('owner_address', f.ownerAddress), R(', in the County of '), f.V('county', f.ownerCounty), R('.')]);
  numbered(t, 3, [R('I, individually, and on behalf of Merchant Defendant consent to the jurisdiction of this Court.')]);
  numbered(t, 4, [
    R('Merchant Defendant hereby confesses judgment and authorizes entry of judgment in favor of Plaintiff and against Defendants in the District Court in and for Black Hawk County in the State of Iowa, in the sum of '),
    f.V('judgment', f.judgment),
    R(' which consists of the purchased amount of '),
    f.V('purchase', f.purchase),
    R(' plus a $7,500.00 default fee as stipulated in the Merchant Cash Advance Agreement.'),
  ]);
  numbered(t, 5, [
    R('In addition, I hereby confess judgment, individually and personally, jointly and severally, and authorize entry of judgment in favor of Plaintiff, against myself and against me personally in the District Court in and for Black Hawk County in the State of Iowa in the sum of '),
    f.V('judgment', f.judgment),
    R(' which consists of the purchased amount of '),
    f.V('purchase', f.purchase),
    R(' plus a $7,500.00 default fee as stipulated in the Merchant Cash Advance Agreement. Judgment in the amount of '),
    f.V('judgment', f.judgment),
    R(' may be entered as of the date of execution and evidenced by filing with the State of Iowa.'),
  ]);
  numbered(t, 6, [R('Furthermore, I, individually, and on behalf of Merchant Defendant acknowledge and provide informed consent for the entry of judgment in favor of Plaintiff and against Defendants. I understand there are material risks involved when confessing judgment and that I am waiving certain legal rights and remedies available to myself and to Merchant Defendant. Knowing the risks, I still confess judgment on behalf of myself, and on behalf of Merchant Defendant.')]);
  numbered(t, 7, [
    R('This confession of judgment is for a debt due to Plaintiff arising from Defendants’ failure to pay to Plaintiff, Merchant Defendant’s accounts receivable, which were purchased by Plaintiff pursuant to the Merchant Cash Advance Agreement, and for Defendants’ breach of the Merchant Cash Advance Agreement, plus agreed-upon interest, costs and disbursements, as agreed-upon by Merchant Defendant and myself, under the secured Merchant Cash Advance Agreement, dated '),
    f.V('date', f.agreementDate),
    R('.'),
  ]);
  numbered(t, 8, [R('Merchant Defendant and I hereby agree that the execution and delivery of this Affidavit of Confession of Judgment and any entry of judgment thereon shall be without prejudice to any and all rights of Plaintiff, who reserves all of its rights and remedies against Defendants.')]);
  numbered(t, 9, [R('If for any reason entry of judgment in the above-specified amount or execution on the same is outside the jurisdiction of this Court, Merchant Defendant and I hereby consent to the personal jurisdiction, entry of judgment, and execution thereon in any State or Federal Court of the United States of America.')]);
  numbered(t, 10, [
    R('I have been authorized by Merchant Defendant to sign this Affidavit of Confession of Judgment on this '),
    f.V('date', f.dayOrdinal),
    R(' day of '),
    f.V('date', f.month),
    R(', '),
    f.V('date', f.year),
    R('. I certify under penalty of perjury and pursuant to the laws of the State of Iowa that the preceding is true and correct.'),
  ]);
  t.signatureLine('By:', LEFT - 4, 230);
  t.paragraph([f.V('owner', f.owner), R(', individually, and on behalf of')], { left: LEFT - 4, align: 'left', leading: 14 });
  // Signature block: the business and additional names joined with "AND", in regular type (the line above the date).
  t.paragraph([R(f.merchantAnd)], { left: LEFT - 4, align: 'left', leading: 14 });
  if (f.cojDate) {
    t.y += 8;
    t.paragraph([R('Date: '), f.V('date', f.cojDate)], { left: LEFT - 4, align: 'left', leading: 14 });
  }
  return t;
}

// ---------- New York COJs (PDF only: downloaded and emailed, never sent through BoldSign) ----------
//
// All three NY forms share one layout (the team's sample COJs): sans-serif type, the court lines,
// a boxed "-against-" caption with "Index No." and "AFFIDAVIT OF / CONFESSION OF JUDGMENT", the
// blank oath venue ("STATE OF ___ ) ss.: COUNTY OF ___ )"), four left-aligned paragraphs with a gap
// between them, the "BY:" signature and the jurat (or, for the general form, the notary
// acknowledgment). Filled values print bold.

type NyKind = 'business' | 'merchant' | 'general';

const NY_LEFT = 62; // body text
const NY_RIGHT = 556;
const NY_CAPTION_LEFT = 54;

/** The same names in regular type. */
const regular = (runs: Run[]): Run[] => runs.map((r) => ({ text: r.text }));

/** A vertical rule (the caption box's right edge). */
function vline(t: Typesetter, x: number, fromTop: number, toTop: number) {
  t.page.drawLine({ start: { x, y: PAGE_H - fromTop }, end: { x, y: PAGE_H - toTop }, thickness: 0.8, color: rgb(0, 0, 0) });
}

/** Court line "COUNTY OF <county>" with the filled county in bold (a blank line when empty). */
const courtCounty = (f: ReturnType<typeof cojFacts>, county: string): Run[] =>
  county ? [R('COUNTY OF '), f.V('county', county)] : [R('COUNTY OF ___________')];

/** The year the forms print ("in the year 2026"): the agreement's, else this year. */
const nyYear = (f: ReturnType<typeof cojFacts>) => f.year || String(new Date().getFullYear());

/** Page number centred on every page; "Initials: ____" on every page but the signature page. */
function nyFooter(t: Typesetter, pageNo: number) {
  const base = PAGE_H - 44;
  const n = String(pageNo);
  t.draw(n, (PAGE_W - t.width(n, false, 11)) / 2, base, { size: 11 });
  if (pageNo < t.pages.length) {
    const lineX = RIGHT - 52;
    const label = 'Initials:';
    t.draw(label, lineX - t.width(label, false, 11) - 4, base, { size: 11 });
    t.line(lineX, RIGHT, base + 1);
  }
}

function nyCaption(t: Typesetter, f: ReturnType<typeof cojFacts>, county: string, defendants: Run[]) {
  t.y = 76;
  t.paragraph([R('SUPREME COURT OF THE STATE OF NEW YORK')], { left: NY_CAPTION_LEFT, align: 'left', leading: 13 });
  t.paragraph(courtCounty(f, county), { left: NY_CAPTION_LEFT, align: 'left', leading: 13 });
  const top = t.y - 9;
  const boxRight = 366;
  t.line(NY_CAPTION_LEFT, boxRight, top, 0.8);
  // Right column.
  t.draw('Index No.', 385, top + 12);
  t.draw('AFFIDAVIT OF', 385, top + 42, { bold: true });
  t.draw('CONFESSION OF JUDGMENT', 385, top + 54, { bold: true });
  // Box.
  t.y = top + 12;
  t.paragraph([f.V('plaintiff', f.plaintiff), R(',')], { left: NY_CAPTION_LEFT + 6, right: boxRight - 8, align: 'left', leading: 13 });
  t.y += 16;
  t.draw('Plaintiff,', 228, t.y);
  t.y += 26;
  t.draw('-against-', 186, t.y);
  t.y += 30;
  t.paragraph(defendants, { left: NY_CAPTION_LEFT + 6, right: boxRight - 8, align: 'left', leading: 13 });
  t.y += 26;
  t.draw('Defendants.', 230, t.y);
  const bottom = t.y + 4;
  t.line(NY_CAPTION_LEFT, boxRight, bottom, 0.8);
  vline(t, boxRight, top, bottom);
  // Oath venue: left blank for the notary.
  t.y = bottom + 32;
  t.draw('STATE OF', NY_CAPTION_LEFT, t.y);
  t.draw('_____________', NY_CAPTION_LEFT + 52, t.y);
  t.draw(')', 196, t.y);
  t.y += 13;
  t.draw(') ss.:', 196, t.y);
  t.y += 13;
  t.draw('COUNTY OF', NY_CAPTION_LEFT, t.y);
  t.draw('____________', NY_CAPTION_LEFT + 62, t.y);
  t.draw(')', 196, t.y);
  t.y += 34;
}

/** A body paragraph: left-aligned, first-line indent, a gap after it (as on the sample forms). */
const nyParagraph = (t: Typesetter, runs: Run[], indent = 28) =>
  t.paragraph(runs, { left: NY_LEFT, right: NY_RIGHT, indent, align: 'left', gapAfter: Math.round(t.leading * 0.7) });

/** "BY: ______" on the right and the signer line(s) under it. */
function nySignature(t: Typesetter, label: string, lines: Run[][], x: number) {
  t.ensure(120);
  t.y += 28;
  t.draw(label, x, t.y);
  t.line(x + t.width(label, false, t.body) + 2, Math.min(x + 230, RIGHT), t.y + 1, 0.9);
  t.y += 18;
  for (const runs of lines) t.paragraph(runs, { left: x + (label === 'BY:' ? 10 : 0), right: RIGHT, align: 'left', leading: 13 });
}

/** Business / Individual jurat: "Sworn to before me this / ____, 2026", then the notary line. */
function nyJurat(t: Typesetter, year: string) {
  t.ensure(110);
  t.y += 10;
  t.draw('Sworn to before me this', NY_CAPTION_LEFT, t.y);
  t.y += 18;
  const blank = '______________';
  t.draw(blank, NY_CAPTION_LEFT, t.y);
  t.draw(`, ${year}`, NY_CAPTION_LEFT + t.width(blank, false, t.body), t.y);
  t.y += 56;
  t.line(NY_CAPTION_LEFT + 2, NY_CAPTION_LEFT + 136, t.y, 1);
  t.y += 18;
  t.draw('Notary', NY_CAPTION_LEFT + 26, t.y);
  t.y += 10;
}

/** General form: notary acknowledgment, the notary signature line and the seal box. */
function nyNotaryAcknowledgment(t: Typesetter, f: ReturnType<typeof cojFacts>) {
  t.ensure(250);
  t.y += 40;
  t.paragraph(
    [
      R(`On the ____ day of _____________, in the year ${nyYear(f)}, before me, the undersigned Notary Public in and for said state, personally appeared `),
      f.V('owner', `${f.owner},`),
      R(' personally known to me or proved to me on the basis of satisfactory evidence to be the individual whose name is subscribed to the within instrument and acknowledged to me that he/she executed the same in his/her capacity, and that by his/her signature on the instrument, the individual, or the person upon behalf of which the individual acted, executed the instrument.'),
    ],
    { left: NY_CAPTION_LEFT, right: NY_RIGHT, align: 'left', leading: 13 },
  );
  t.y += 16;
  const sealX = 310;
  const sealTop = t.y + 6;
  t.draw('Notary Seal', sealX + (RIGHT - sealX - t.width('Notary Seal', false, t.body)) / 2, t.y);
  t.page.drawRectangle({ x: sealX, y: PAGE_H - (sealTop + 92), width: RIGHT - sealX, height: 92, borderColor: rgb(0, 0, 0), borderWidth: 0.8 });
  t.line(NY_CAPTION_LEFT, NY_CAPTION_LEFT + 116, sealTop + 6);
  t.draw('Notary Public', NY_CAPTION_LEFT + 36, sealTop + 20);
  t.y = sealTop + 122;
  t.draw('My Commission Expires on: ____________________', 272, t.y);
  t.y += 10;
}

async function nyCoj(kind: NyKind, values: Values, scale = 1) {
  const f = cojFacts(values);
  const t = new Typesetter({
    footer: nyFooter,
    scale,
    spacing: cojLineSpacingFactor(values.coj_line_spacing),
    sans: { body: 10, leading: 18 },
  });
  await t.init();

  const defendants =
    kind === 'general'
      ? [...f.M(), R(' and '), f.V('owner', `${f.owner},`)]
      : kind === 'merchant'
        ? [f.V('owner', `${f.owner},`)]
        : [...f.M()];
  nyCaption(t, f, kind === 'merchant' ? f.ownerCounty : f.businessCounty, defendants);

  // 1. Deponent.
  nyParagraph(
    t,
    [
      f.V('owner', `${f.owner},`),
      R(' being duly sworn, hereby deposes and says; that Deponent is the Owner of Defendant '),
      ...f.M({ and: true }),
      R(' and that he/she is duly authorized to make this affidavit (the "Affidavit") on behalf of himself/herself and on behalf of all of the Defendants herein.'),
    ],
    64,
  );
  // 2. The sum confessed.
  nyParagraph(t, [
    R('The Defendants (referred to hereinafter jointly and severally as the "Judgment Debtors/Defendants") all jointly and severally hereby Confess Judgment herein, and authorize entry of judgment against them as the Judgment Debtors/Defendants in the sum of (a) '),
    f.V('purchase', f.purchase),
    R(', less any payments made, plus (b) interest thereon at 16% per annum from the date of default to the date of the entry of the Judgment, and (c) all of the costs and disbursements, and (d) default fees in the amount of $7,500.00 pursuant to the Merchant Agreement. Such amount shall be set-forth in an affidavit under oath by Plaintiff, which shall be attached hereto and filed contemporaneously with this Confession of Judgment.'),
  ]);
  // 3. Where the defendants are, and the county.
  const venueTail: Run[] = [
    R('. Judgment Debtors/Defendants authorize entry of Judgment and confess Judgment against each and every one of them in the Supreme Court of the State of New York, County of '),
  ];
  if (kind === 'business') {
    nyParagraph(t, [...f.M(), R(' is/are located at '), f.V('business_address', `${f.businessAddress}`), ...venueTail, f.V('county', `${f.businessCounty}.`)]);
  } else if (kind === 'merchant') {
    nyParagraph(t, [f.V('owner', f.owner), R(' resides at '), f.V('owner_address', f.ownerAddress), ...venueTail, f.V('county', `${f.ownerCounty}.`)]);
  } else {
    nyParagraph(t, [
      f.V('owner', f.owner),
      R(' resides at '),
      f.V('owner_address', f.ownerAddress),
      R(' and '),
      ...f.M(),
      R(' is/are located at '),
      f.V('business_address', f.businessAddress),
      ...venueTail,
      f.V('county', `${f.businessCounty}.`),
    ]);
  }
  // 4. The debt.
  if (kind === 'general') {
    nyParagraph(t, [
      R('This confession of judgment is for a debt due to Plaintiff arising from '),
      ...f.M(),
      R('’s accounts-receivable, which were purchased by Plaintiff pursuant to the Merchant Agreement, dated '),
      f.V('date', f.agreementDate),
      R(' executed by the parties (hereinafter, the "Merchant Agreement") and Debtors/Defendants\' breach thereof. This Affidavit is made in connection with the Merchant Agreement and is solely for the purchase of commercial or business commodities. This Affidavit may be filed ex parte by Plaintiff, without further notice. Agreed-upon interest, reasonable attorneys\' fees, costs and disbursements, are to be included as agreed-upon by Debtors/Defendants, under the secured Merchant Agreement, of which supporting documents include a Personal Guarantee of Performance.'),
    ]);
  } else {
    nyParagraph(t, [
      R('This confession of judgment arises from a debt due to Plaintiff arising from the agreement and guarantee executed between the parties on '),
      f.V('date', f.agreementDate),
      R(' (hereinafter, the “Merchant Agreement”) and Debtor/Defendant’s breach thereof. This Affidavit is made in connection with the Merchant Agreement which was solely for the purchase of commercial or business assets. This Affidavit may be filed ex parte by Plaintiff, without further notice.'),
    ]);
  }

  // Signature and notary.
  if (kind === 'general') {
    nySignature(t, 'By:', [[f.V('owner', `${f.owner},`), R(' individually, and on behalf of')], [...f.M()]], 306);
    nyNotaryAcknowledgment(t, f);
  } else {
    const signer = kind === 'business' ? [f.V('owner', f.owner), R(', on behalf of '), ...f.M()] : [f.V('owner', f.owner)];
    nySignature(t, 'BY:', [signer], 287);
    nyJurat(t, nyYear(f));
  }
  return t;
}

const nyBusiness = (values: Values, scale = 1) => nyCoj('business', values, scale);
const nyGeneral = (values: Values, scale = 1) => nyCoj('general', values, scale);
const nyMerchant = (values: Values, scale = 1) => nyCoj('merchant', values, scale);

const BUILDERS: Record<CojKind, (values: Values, scale?: number) => Promise<Typesetter>> = {
  coj_iowa: iowa,
  coj_ny_business: nyBusiness,
  coj_ny_general: nyGeneral,
  coj_ny_merchant: nyMerchant,
};

/**
 * A typed COJ inside a PearSign package: its page range in the merged PDF and the Review
 * entries (value key → CRM variable) it is rebuilt from whenever a value changes.
 */
export type PackageTypedCoj = {
  kind: CojKind;
  /** First page in the merged package (1-based). */
  startPage: number;
  pageCount: number;
  inputs: Array<{ key: string; variable: string; label: string }>;
};

/** The values a COJ prints, in Review order: variable (CRM prefill id) and label. */
const COJ_INPUTS: Record<CojKind, Array<[string, string]>> = {
  coj_iowa: [
    ['owner1_guarantor_name', 'Owner name'],
    ['business_name_with_dba', 'Merchant name'],
    ['owner_state', 'Sworn state'],
    ['owner_county', 'Sworn county'],
    ['guarantor_address_full', 'Owner address'],
    ['coj_repayment_amount', 'Repayment amount / RTR (judgment = this + $7,500.00)'],
    ['agreement_date', 'Agreement date'],
    ['funder_name', 'Plaintiff'],
    ['coj_additional_names', 'Additional names (separate with , or ;)'],
    ['coj_date', 'COJ date (under the signature)'],
    ['coj_bold', 'Bold text'],
    ['coj_line_spacing', 'Line spacing'],
  ],
  coj_ny_business: [
    ['owner1_guarantor_name', 'Owner name'],
    ['business_name_with_dba', 'Merchant name'],
    ['owner_state', 'Sworn state'],
    ['owner_county', 'Sworn county'],
    ['business_county', 'Venue county'],
    ['business_address_full', 'Business address'],
    ['coj_repayment_amount', 'Repayment amount / RTR'],
    ['agreement_date', 'Agreement date'],
    ['funder_name', 'Plaintiff'],
    ['coj_additional_names', 'Additional names (separate with , or ;)'],
    ['coj_date', 'COJ date (under the signature)'],
    ['coj_bold', 'Bold text'],
    ['coj_line_spacing', 'Line spacing'],
  ],
  coj_ny_general: [
    ['owner1_guarantor_name', 'Owner name'],
    ['business_name_with_dba', 'Merchant name'],
    ['owner_state', 'Sworn state'],
    ['owner_county', 'Sworn county'],
    ['business_county', 'Venue county'],
    ['guarantor_address_full', 'Owner address'],
    ['business_address_full', 'Business address'],
    ['coj_repayment_amount', 'Repayment amount / RTR'],
    ['agreement_date', 'Agreement date'],
    ['funder_name', 'Plaintiff'],
    ['coj_additional_names', 'Additional names (separate with , or ;)'],
    ['coj_date', 'COJ date (under the signature)'],
    ['coj_bold', 'Bold text'],
    ['coj_line_spacing', 'Line spacing'],
  ],
  coj_ny_merchant: [
    ['owner1_guarantor_name', 'Owner name'],
    ['business_name_with_dba', 'Merchant name'],
    ['owner_state', 'Sworn state'],
    ['owner_county', 'Sworn / venue county'],
    ['guarantor_address_full', 'Owner address'],
    ['coj_repayment_amount', 'Repayment amount / RTR'],
    ['agreement_date', 'Agreement date'],
    ['funder_name', 'Plaintiff'],
    ['coj_additional_names', 'Additional names (separate with , or ;)'],
    ['coj_date', 'COJ date (under the signature)'],
    ['coj_bold', 'Bold text'],
    ['coj_line_spacing', 'Line spacing'],
  ],
};

/** Fallback CRM ids per input, matching what cojFacts prints when the main id is empty. */
const COJ_INPUT_FALLBACKS: Record<string, string[]> = {
  business_name_with_dba: ['client_legal_name', 'disclosure_merchant_name'],
  owner1_guarantor_name: ['guaranty_owner1_name', 'client_name'],
  guarantor_address_full: ['mailing_address_full'],
  business_county: ['owner_county'],
  agreement_date: ['signature_date'],
};

/**
 * The editable inputs of a typed COJ with the value it would print now (state spelled out,
 * judgment total derived), for the Review list.
 */
export function cojInputs(kind: CojKind, values: Values): Array<{ variable: string; label: string; value: string }> {
  const f = cojFacts(values);
  return COJ_INPUTS[kind].map(([variable, label]) => {
    let value = v(values, variable, ...(COJ_INPUT_FALLBACKS[variable] ?? []));
    if (variable === 'owner_state') value = f.ownerState;
    if (variable === 'coj_sum_with_default') value = f.judgment.replace(/^\$/, '');
    if (variable === 'coj_repayment_amount') value = f.purchase.replace(/^\$/, '');
    if (variable === 'coj_date') value = f.cojDate;
    if (variable === 'coj_line_spacing') value = COJ_LINE_SPACINGS.find(([k]) => k === String(values.coj_line_spacing ?? '').trim().toLowerCase())?.[0] ?? 'normal';
    if (variable === 'coj_bold') value = [...cojBoldGroups(values.coj_bold)].join(',') || 'none';
    return { variable, label, value };
  });
}

/**
 * The typed COJ PDF and its signer spots: a signature box on the signature line and an initials
 * box in every page footer (Iowa and the New York COJs alike).
 */
export async function renderTypedCoj(
  kind: CojKind,
  values: Values,
  opts: { pageCount?: number } = {},
): Promise<{ pdf: Buffer; placements: DocumentLayoutPlacement[]; pageCount: number }> {
  // A COJ already placed in a package keeps its page count (later pages' fields depend on it):
  // shrink the text until it fits, and pad with an empty page when it got shorter.
  let t = await BUILDERS[kind](values);
  const target = opts.pageCount;
  if (target) {
    for (const scale of [0.95, 0.9, 0.85, 0.8, 0.75]) {
      if (t.pages.length <= target) break;
      t = await BUILDERS[kind](values, scale);
    }
    while (t.pages.length < target) t.newPage();
  }
  const pdf = await t.finish();
  const placements: DocumentLayoutPlacement[] = t.marks.map((m, i) => ({
    id: `typed_${m.kind}_${i + 1}`,
    type: m.kind,
    documentId: '1',
    pageNumber: String(m.page),
    x: String(Math.round(m.x)),
    y: String(Math.round(m.y)),
    signerRole: 'Signer',
    optional: false,
    slot: `${m.kind}_p${m.page}_${Math.round(m.x)}_${Math.round(m.y)}`,
  }));
  return { pdf, placements, pageCount: t.pages.length };
}

/** Default text of fillable fields (all editable). */
const FILLABLE_DEFAULTS: Record<string, string> = { PLAINTIFF: 'CASHABLE FUND LLC' };

/**
 * A COJ as a fillable PDF form: same wording and layout as the CRM's typed COJ, with a form field
 * on every value (same-named fields are linked: type the owner's name once, it fills everywhere).
 */
export async function renderFillableCoj(kind: CojKind): Promise<Buffer> {
  const t = await BUILDERS[kind]({ __fillable: '1' });
  const placed = [...t.fields];
  const doc = await PDFDocument.load(await t.finish());
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.TimesRomanBold);
  const made = new Map<string, ReturnType<typeof form.createTextField>>();
  for (const f of placed) {
    let field = made.get(f.name);
    if (!field) {
      field = form.createTextField(f.name);
      if (FILLABLE_DEFAULTS[f.name]) field.setText(FILLABLE_DEFAULTS[f.name]);
      made.set(f.name, field);
    }
    field.addToPage(doc.getPage(f.page), { x: f.x, y: f.y, width: f.w, height: f.h, borderWidth: 0, backgroundColor: rgb(0.9, 0.94, 1), font });
  }
  for (const field of made.values()) field.setFontSize(0); // auto-fit to the blank
  form.updateFieldAppearances(font);
  return Buffer.from(await doc.save());
}
