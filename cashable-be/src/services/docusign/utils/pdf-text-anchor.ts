/**
 * Text-anchor positioning for burned (flattened) prefill values.
 *
 * A layout placement may carry an `anchor`: a snippet of the template's own
 * text (e.g. ", in the County of"). At render time we find where that text
 * actually ends on the page of the *uploaded* template PDF and place the value
 * right after it, instead of trusting the layout's hardcoded x. This keeps
 * values clear of labels even when the CRM template PDF was re-uploaded with
 * slightly different typesetting than the PDF the layout was measured from.
 *
 * Coordinates: pdf.js text items use PDF units with a bottom-origin y
 * (transform[5] = text baseline), which matches pdf-lib's drawText baseline.
 */

// pdf-parse ships a Node-compatible pdf.js build; reuse it instead of adding
// a second pdfjs dependency.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjs = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');

export type PlacementAnchor = {
  /** Template text the value follows. Matched ignoring whitespace differences. */
  text: string;
  /** 1-based match index when the text appears more than once on the page. */
  occurrence?: number;
  /** Gap in PDF units between the anchor text and the value (default 6). */
  padding?: number;
  /**
   * Ignore the anchor when it would move the value more than this far from
   * the layout's configured x (default 90) — guards against a wrong match.
   */
  maxShift?: number;
};

type IndexedChar = {
  ch: string;
  xStart: number;
  xEnd: number;
  /** Baseline y, bottom-origin PDF units. */
  baselineY: number;
};

export type PdfPageTextIndex = {
  /** Non-whitespace characters in reading order. */
  chars: IndexedChar[];
  /** Concatenated non-whitespace characters, same indexes as `chars`. */
  squashed: string;
};

export type PdfTextIndex = {
  pages: Array<PdfPageTextIndex | null>;
};

export type AnchorHit = {
  /** Right edge of the anchor text, PDF units from the left. */
  endX: number;
  /** Baseline of the anchor's line, bottom-origin PDF units. */
  baselineY: number;
};

/** Parse every page's text with positions. Returns null when the PDF has no text layer. */
export async function loadPdfTextIndex(pdf: Buffer): Promise<PdfTextIndex | null> {
  try {
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(pdf),
      // Keep the parse self-contained: no worker, no external font fetches.
      disableWorker: true,
      disableFontFace: true,
    }).promise;

    const pages: Array<PdfPageTextIndex | null> = [];
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      const chars: IndexedChar[] = [];

      type TextItem = { str: string; width: number; transform: number[] };
      const items = (content.items as TextItem[])
        .filter((it) => typeof it.str === 'string' && it.str.length > 0)
        // Reading order: top line first (higher bottom-origin y), then left to right.
        .sort((a, b) => {
          const dy = b.transform[5] - a.transform[5];
          if (Math.abs(dy) > 2) return dy;
          return a.transform[4] - b.transform[4];
        });

      for (const it of items) {
        const baselineY = it.transform[5];
        const xStart = it.transform[4];
        const perChar = it.str.length > 0 ? it.width / it.str.length : 0;
        for (let i = 0; i < it.str.length; i += 1) {
          const ch = it.str[i];
          if (/\s/.test(ch)) continue;
          chars.push({
            ch,
            xStart: xStart + perChar * i,
            xEnd: xStart + perChar * (i + 1),
            baselineY,
          });
        }
      }

      pages.push(
        chars.length
          ? { chars, squashed: chars.map((c) => c.ch).join('') }
          : null,
      );
    }
    return { pages };
  } catch {
    // Encrypted / scanned / malformed PDF: caller falls back to static coords.
    return null;
  }
}

/**
 * Find where `anchor.text` ends on the page (0-based pageIndex).
 * Whitespace is ignored on both sides, so "in the County of" matches however
 * the PDF splits it into text runs.
 */
export function findAnchorEnd(
  index: PdfTextIndex | null,
  pageIndex: number,
  anchor: PlacementAnchor,
): AnchorHit | null {
  const page = index?.pages?.[pageIndex];
  if (!page) return null;

  const needle = String(anchor.text || '').replace(/\s+/g, '');
  if (!needle) return null;

  const wanted = Math.max(1, Math.floor(anchor.occurrence ?? 1));
  let from = 0;
  let at = -1;
  for (let found = 0; found < wanted; found += 1) {
    at = page.squashed.indexOf(needle, from);
    if (at < 0) return null;
    from = at + 1;
  }

  const last = page.chars[at + needle.length - 1];
  if (!last) return null;
  return { endX: last.xEnd, baselineY: last.baselineY };
}
