/**
 * Shared letterhead layout for the Payoff, Zero Balance and Payoff Wire letters:
 * brand-tinted sidebar down the left (logo on a white chip, document name, date,
 * company), content column on the right with a serif heading, right-aligned
 * detail rows, boxed wire-information list, faint blurred logo watermark,
 * sign-off and a solid brand footer bar. Tables + inline styles only so it
 * renders the same in email clients and the letter PDF.
 * Branding (name, logo, colours) comes from the funder's letter branding.
 * Inputs must be HTML-escaped.
 */
import { APP_COMPANY_LEGAL_NAME, APP_COMPANY_NAME } from "@/constants/appBranding";
import { escapeHtml } from "./applicationApprovalEmailShared";
import {
  DEFAULT_LETTER_EMAIL_BRANDING,
  type LetterEmailBranding,
} from "./letterEmailBranding";

export const LETTER_FONT = "font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;";
export const LETTER_SERIF = "font-family:Georgia,'Times New Roman',Times,serif;";
export const LETTER_DARK = "#111827";
export const LETTER_BODY = "#374151";
export const LETTER_MUTED = "#6b7280";
export const LETTER_RULE = "#e5e7eb";

const FONT = LETTER_FONT;
const LETTER_WIDTH = 794;
const SIDEBAR_WIDTH = 216;

/** Mix a #rrggbb colour with white; ratio 0 = white, 1 = the colour itself. */
export function letterTint(hex: string, ratio: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return "#f3f4f6";
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(255 + (c - 255) * ratio);
  const to2 = (c: number) => c.toString(16).padStart(2, "0");
  return `#${to2(mix((n >> 16) & 255))}${to2(mix((n >> 8) & 255))}${to2(mix(n & 255))}`;
}

/**
 * Faint (6%), heavily blurred copy of the letter logo. Cloudinary logos get the
 * transform baked in (email/PDF clients ignore CSS blur/opacity); other hosts
 * fall back to the branding's own watermark image.
 */
export function letterWatermarkSrc(branding: LetterEmailBranding): string {
  const logo = String(branding.logoSrc ?? "").trim();
  if (/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(logo)) {
    return logo.replace("/image/upload/", "/image/upload/o_6,e_blur:800,f_png/");
  }
  return String(branding.watermarkSrc ?? "").trim();
}

/** Legal name for the sign-off / footer (the platform's legal entity for the default branding). */
export function letterCompanyLegalName(branding: LetterEmailBranding): string {
  return branding === DEFAULT_LETTER_EMAIL_BRANDING
    ? APP_COMPANY_LEGAL_NAME
    : branding.companyName;
}

/** Short name used in letter copy (e.g. "Cashable"). */
export function letterCompanyShortName(branding: LetterEmailBranding): string {
  return branding === DEFAULT_LETTER_EMAIL_BRANDING
    ? APP_COMPANY_NAME
    : branding.companyName;
}

/** "10/22/2026" (Letters page format) → "October 22, 2026"; anything else unchanged. */
export function toLongLetterDate(value: string): string {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(value);
  if (!m) return value;
  const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** "October 22, 2026" — used when no letter date is supplied. */
export function todayLongDate(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Bold inline value inside a paragraph. */
export function letterStrong(text: string): string {
  return `<strong style="color:${LETTER_DARK};font-weight:600;">${text}</strong>`;
}

export function letterParagraph(text: string, bottom: number): string {
  return `
                <tr>
                  <td style="${FONT}padding:0 0 ${bottom}px 0;font-size:13px;line-height:1.7;color:${LETTER_BODY};">${text}</td>
                </tr>`;
}

export type LetterDetailRow = { label: string; value: string; subtle?: boolean };

/**
 * Detail rows: ledger style — muted label left, bold value right-aligned,
 * hairline rules between rows, a heavier accent rule top and bottom.
 * `accent` is the branding's dark accent (escaped).
 */
export function letterDetailsTable(rows: LetterDetailRow[], accent = LETTER_DARK): string {
  const body = rows
    .map((row, i) => {
      const border = i === rows.length - 1 ? "" : `border-bottom:1px solid ${LETTER_RULE};`;
      return `
                      <tr>
                        <td style="${FONT}padding:11px 2px;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${LETTER_MUTED};vertical-align:middle;${border}">${row.label}</td>
                        <td align="right" style="${FONT}padding:11px 2px;text-align:right;font-size:${row.subtle ? "12px" : "13px"};font-weight:${row.subtle ? "400" : "700"};color:${row.subtle ? LETTER_MUTED : LETTER_DARK};vertical-align:middle;${border}">${row.value}</td>
                      </tr>`;
    })
    .join("");
  return `
                <tr>
                  <td style="padding:0 0 26px 0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;border-top:2px solid ${accent};border-bottom:2px solid ${accent};">${body}
                    </table>
                  </td>
                </tr>`;
}

/**
 * Wire information: boxed stacked list with a tinted title row; each line has a
 * narrow accent label column. `accent` is the branding's dark accent (escaped).
 */
export function letterWireInformation(opts: {
  bank: string;
  bankAddress: string;
  routing: string;
  beneficiary: string;
  beneficiaryAddress: string;
  account: string;
  accent?: string;
}): string {
  const accent = opts.accent || LETTER_DARK;
  const tint = letterTint(accent, 0.08);
  const sub = `display:inline-block;padding-top:2px;font-size:11px;font-weight:400;color:${LETTER_MUTED};`;
  const line = (label: string, value: string, detail: string, last = false) => `
                      <tr>
                        <td width="150" style="${FONT}width:150px;padding:11px 16px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${accent};vertical-align:top;${last ? "" : `border-bottom:1px solid ${LETTER_RULE};`}">${label}</td>
                        <td style="${FONT}padding:11px 16px 11px 0;font-size:13px;font-weight:600;color:${LETTER_DARK};vertical-align:top;${last ? "" : `border-bottom:1px solid ${LETTER_RULE};`}">${value}${detail ? `<br /><span style="${sub}">${detail}</span>` : ""}</td>
                      </tr>`;
  return `
                <tr>
                  <td style="padding:0 0 32px 0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;border:1px solid ${accent};">
                      <tr>
                        <td colspan="2" bgcolor="${tint}" style="${FONT}padding:10px 16px;font-size:12px;font-weight:700;letter-spacing:2.5px;color:${accent};background-color:${tint};border-bottom:1px solid ${accent};">WIRE INFORMATION</td>
                      </tr>
                      ${line("Bank", opts.bank, opts.bankAddress)}
                      ${line("Routing", opts.routing, "")}
                      ${line("Beneficiary", opts.beneficiary, opts.beneficiaryAddress)}
                      ${line("Account", opts.account, "", true)}
                    </table>
                  </td>
                </tr>`;
}

export function renderLetterDocument(opts: {
  branding: LetterEmailBranding;
  documentTitle: string;
  heading: string;
  /** Escaped letter date (MM/DD/YYYY is shown in long form). */
  letterDate: string;
  bodyRows: string;
  /** Bold line under "Best Regards," (sender name, or the signature title). */
  signerLine: string;
  /** Optional grey title line under the signer (omitted when it equals the signer). */
  signatureTitle?: string;
}): string {
  const { branding } = opts;
  const company = escapeHtml(letterCompanyLegalName(branding));
  const companyAlt = escapeHtml(branding.companyName);
  const logoSrc = escapeHtml(branding.logoSrc);
  const watermarkSrc = escapeHtml(letterWatermarkSrc(branding));
  const accentDark = escapeHtml(branding.accentStripDark);
  const sidebarBg = letterTint(branding.accentStripDark, 0.07);
  const sidebarRule = letterTint(branding.accentStripDark, 0.25);
  const watermarkStyle = watermarkSrc
    ? `background-image:url('${watermarkSrc}');background-repeat:no-repeat;background-position:center 55%;background-size:85% auto;`
    : "";
  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" alt="${companyAlt}" width="128" border="0" style="display:block;width:128px;max-width:128px;height:auto;" />`
    : `<span style="${FONT}font-size:16px;line-height:1.3;font-weight:700;color:${accentDark};">${companyAlt}</span>`;
  const titleLine =
    opts.signatureTitle && opts.signatureTitle !== opts.signerLine
      ? `<br /><span style="font-size:12px;color:${LETTER_MUTED};">${opts.signatureTitle}</span>`
      : "";
  const documentWords = escapeHtml(opts.documentTitle).toUpperCase().split(/\s+/).join("<br />");
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${opts.documentTitle}</title>
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; display: block; }
    a { text-decoration: none; }
    @media only screen and (max-width: 660px) {
      .letter-container { width: 100% !important; max-width: 100% !important; }
      .content-pad { padding-left: 24px !important; padding-right: 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#ffffff;${FONT}-webkit-font-smoothing:antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#ffffff;">
    <tr>
      <td align="center" style="padding:0;">
        <table role="presentation" data-letter-pdf-card="1" class="letter-container" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 auto;width:100%;max-width:${LETTER_WIDTH}px;border-collapse:collapse;background-color:#ffffff;">
          <tr>
            <td width="${SIDEBAR_WIDTH}" bgcolor="${sidebarBg}" valign="top" style="width:${SIDEBAR_WIDTH}px;background-color:${sidebarBg};border-right:1px solid ${sidebarRule};padding:36px 24px;vertical-align:top;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 28px 0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                      <tr>
                        <td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid ${sidebarRule};padding:14px;line-height:0;font-size:0;">
                          ${logoHtml}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 20px 0;line-height:0;font-size:0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                      <tr><td width="28" height="3" bgcolor="${accentDark}" style="width:28px;height:3px;line-height:3px;font-size:3px;background-color:${accentDark};padding:0;">&nbsp;</td></tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="${FONT}padding:0 0 22px 0;font-size:15px;font-weight:700;line-height:1.5;letter-spacing:2px;color:${accentDark};">${documentWords}</td>
                </tr>
                <tr>
                  <td style="${FONT}padding:0 0 4px 0;font-size:10px;font-weight:600;letter-spacing:1.5px;color:${LETTER_MUTED};">DATE</td>
                </tr>
                <tr>
                  <td style="${FONT}padding:0 0 26px 0;font-size:12px;line-height:1.5;color:${LETTER_DARK};">${toLongLetterDate(opts.letterDate)}</td>
                </tr>
                <tr>
                  <td style="padding:0 0 26px 0;border-top:1px solid ${sidebarRule};line-height:0;font-size:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="${FONT}padding:0 0 4px 0;font-size:10px;font-weight:600;letter-spacing:1.5px;color:${LETTER_MUTED};">ISSUED BY</td>
                </tr>
                <tr>
                  <td style="${FONT}font-size:12px;line-height:1.6;color:${LETTER_DARK};">${company}</td>
                </tr>
              </table>
            </td>
            <td class="content-pad" valign="top" style="padding:36px 40px 28px 40px;background-color:#ffffff;vertical-align:top;${watermarkStyle}">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="${LETTER_SERIF}padding:0 0 8px 0;font-size:27px;font-weight:700;line-height:1.25;color:${LETTER_DARK};">${opts.heading}</td>
                </tr>
                <tr>
                  <td style="padding:0 0 28px 0;border-bottom:1px solid ${LETTER_RULE};line-height:0;font-size:0;">&nbsp;</td>
                </tr>
                <tr><td style="padding:0 0 24px 0;line-height:0;font-size:0;">&nbsp;</td></tr>
${opts.bodyRows}
                <tr>
                  <td style="${FONT}padding:4px 0 0 0;font-size:13px;line-height:1.7;color:${LETTER_BODY};">
                    Best Regards,<br />
                    <strong style="display:inline-block;padding-top:10px;font-weight:600;color:${LETTER_DARK};">${opts.signerLine}</strong>${titleLine}<br />
                    <span style="font-size:12px;color:${LETTER_MUTED};">${company}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td colspan="2" bgcolor="${accentDark}" style="${FONT}background-color:${accentDark};padding:11px 24px;text-align:center;font-size:11px;font-weight:600;letter-spacing:2px;color:#ffffff;">${company.toUpperCase()}</td>
          </tr>
          <!-- Spacer row: the PDF renderer zeroes the card's last row, keep the letter out of it. -->
          <tr><td colspan="2" style="height:1px;line-height:1px;font-size:1px;">&nbsp;</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
