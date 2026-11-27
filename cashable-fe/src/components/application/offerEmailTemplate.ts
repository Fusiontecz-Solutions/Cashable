/**
 * Offer email: the deal details as editable "LABEL: value" text, and that text as the branded
 * HTML email that is sent (Cashable logo, title, details table). No app imports, so it can be
 * previewed and tested on its own.
 */
import { resolveOfferFeesPercentForForm } from "@/lib/offerDecisionFees";

type Rec = Record<string, unknown>;

/** Who the offer email goes to by default (editable in the dialog before each send). */
export const OFFER_EMAIL_DEFAULT_TO = ["contract@cashablefunding.com"];
export const OFFER_EMAIL_DEFAULT_CC = [
    "office@cashablefunding.com",
    "ariel@cashablefunding.com",
    "edward@cashablefunding.com",
    "francine@cashablefunding.com",
    "ryan@cashablefunding.com",
];

export const str = (v: unknown) => (v == null ? "" : String(v).trim());
export const num = (v: unknown) => {
    const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
};
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
/** First non-empty text among the candidates. */
const first = (...vals: unknown[]) => vals.map(str).find(Boolean) ?? "";

/** 25000 → "$25K", 27500 → "$27.5K", 950 → "$950". */
export function formatOfferAmountShort(amount: number): string {
    if (!(amount > 0)) return "";
    if (amount >= 1000) {
        const k = Math.round((amount / 1000) * 10) / 10;
        return `$${k.toLocaleString("en-US")}K`;
    }
    return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/** 1.4990 → "1.499", 1.50 → "1.5". */
export function formatFactorRate(rate: number): string {
    if (!(rate > 0)) return "";
    return rate.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

/** 10 digits (optionally with a leading 1) → "(555) 010-2030"; anything else as entered. */
export function formatUsPhone(raw: unknown): string {
    const s = str(raw);
    const d = s.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : s;
}

function termUnit(frequency: string, term: number): string {
    const f = frequency.toLowerCase();
    const plural = term === 1 ? "" : "s";
    if (f.startsWith("dai")) return `day${plural}`;
    if (f.startsWith("bi")) return `bi-weekly payment${plural}`;
    if (f.startsWith("mon")) return `month${plural}`;
    return `week${plural}`;
}

/** "$25K - 15 weeks - 1.499 - 10% fees" from the deal's Scrubbing offer (else the contract's). */
export function buildOfferLine(offer: Rec | null | undefined, fallback?: Rec | null): string {
    const o = { ...rec(fallback), ...Object.fromEntries(Object.entries(rec(offer)).filter(([, v]) => str(v))) };
    const amount = num(first(o.offer, o.fundedAmount, o.purchaseAmount, o.amount));
    const rate = num(first(o.rate, o.factorRate, o.factor));
    const term = num(o.term);
    const feePct = resolveOfferFeesPercentForForm(amount, rate, o.fees);
    const parts = [
        formatOfferAmountShort(amount),
        term > 0 ? `${term} ${termUnit(str(o.frequency ?? o.paymentFrequency), term)}` : "",
        formatFactorRate(rate),
        feePct != null && feePct > 0 ? `${Math.round(feePct * 100) / 100}% fees` : "",
    ].filter(Boolean);
    return parts.join(" - ");
}

/** Monthly revenue on file when the bank statements give none: monthly, else annual ÷ 12. */
export function dealMonthlyRevenue(application: Rec | null | undefined): number {
    const client = rec(rec(application).client);
    const business = rec(client.business);
    const monthly = num(first(business.monthlyRevenue, client.businessMonthlyRevenue));
    if (monthly > 0) return monthly;
    const annual = num(first(business.annualRevenue, client.businessAnnualRevenue));
    return annual > 0 ? annual / 12 : 0;
}

/**
 * The editable email text, filled from everything the deal has: the linked ISO (email, contact,
 * phone), the sales rep when the ISO has no contact, Scrubbing's offer (else the contract's),
 * the owners and business (email / phone), and the bank-statement average revenue (else the
 * monthly / annual revenue on file).
 */
export function buildOfferEmailBody(args: {
    application: Rec | null | undefined;
    offerDecision: Rec | null | undefined;
    averageRevenue: number;
    contractOffer?: Rec | null;
}): string {
    const app = rec(args.application);
    const iso = rec(app.iso);
    const client = rec(app.client);
    const owner = rec(client.owner);
    const owners = Array.isArray(client.owners) ? (client.owners as unknown[]).map(rec) : [];
    const business = rec(client.business);
    const rep = rec(app.salesRepresentative);
    const repName = [str(rep.firstName), str(rep.lastName)].filter(Boolean).join(" ");
    const revenue = args.averageRevenue > 0 ? args.averageRevenue : dealMonthlyRevenue(app);
    const avg = revenue > 0 ? `$${Math.round(revenue).toLocaleString("en-US")}` : "";
    return [
        `ISO EMAIL: ${first(iso.email, iso.agreementEmail)}`,
        `REP NAME: ${first(iso.contactName, iso.managerName, iso.name, repName)}`,
        `REP CELL: ${formatUsPhone(first(iso.phone))}`,
        `OFFER: ${buildOfferLine(args.offerDecision, args.contractOffer)}`,
        `MERCHANT EMAIL: ${first(owner.email, ...owners.map((o) => o.email), business.email, client.ownerEmail, client.businessEmail)}`,
        `MERCHANT PHONE: ${formatUsPhone(
            first(owner.mobileNumber, owner.phone, ...owners.map((o) => o.mobileNumber ?? o.phone), business.number, client.ownerMobileNumber, client.businessNumber),
        )}`,
        `Average Revenue: ${avg}`,
    ].join("\n");
}

const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Cashable wordmark (same hosted logo as the CRM's other emails). */
export const OFFER_EMAIL_LOGO_URL =
    "https://res.cloudinary.com/ar8iuzlv/image/upload/v1793283654/Copy_of_CASHABLE_FUND_LLC_CONTRACT_2.jpg";
const BRAND_GREEN = "#2E8B57";
const BRAND_GREEN_LIGHT = "#EAF6EE";

/**
 * The email as sent: a compact card with the Cashable logo, the business name, then every
 * "LABEL: value" line of the editable text as a row of a details table (the OFFER row
 * highlighted). Lines without a label print as short paragraphs, so free text still goes out.
 */
export function buildOfferEmailHtml(text: string, businessName: string): string {
    const rows: string[] = [];
    const paragraphs: string[] = [];
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const m = /^([^:]{1,40}):\s*(.*)$/.exec(line);
        if (m && !/^https?$/i.test(m[1])) {
            const label = m[1].trim();
            const value = m[2].trim();
            const isOffer = /^offer$/i.test(label);
            const isEmail = /@/.test(value) && !/\s/.test(value);
            const shown = value
                ? isEmail
                    ? `<a href="mailto:${escapeHtml(value)}" style="color:${BRAND_GREEN};text-decoration:none">${escapeHtml(value)}</a>`
                    : escapeHtml(value)
                : `<span style="color:#9AA3AF">—</span>`;
            rows.push(
                `<tr><td style="padding:6px 10px;border-bottom:1px solid #F0F1F3;font-size:11px;letter-spacing:.03em;text-transform:uppercase;color:#6B7280;width:36%;white-space:nowrap">${escapeHtml(label)}</td>` +
                    `<td style="padding:6px 10px;border-bottom:1px solid #F0F1F3;font-size:13px;color:#111827;${isOffer ? `font-weight:bold;background:${BRAND_GREEN_LIGHT};color:#14532D;` : ""}">${shown}</td></tr>`,
            );
        } else {
            paragraphs.push(`<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#374151">${escapeHtml(line)}</p>`);
        }
    }
    const title = businessName ? escapeHtml(businessName) : "New offer";
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#FFFFFF;border:1px solid #E5E7EB;border-top:3px solid ${BRAND_GREEN};border-radius:6px">
<tr><td style="padding:14px 16px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle"><img src="${OFFER_EMAIL_LOGO_URL}" alt="Cashable" width="120" style="display:block;width:120px;height:auto;border:0"></td>
<td align="right" style="vertical-align:middle;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${BRAND_GREEN};font-weight:bold">Offer summary</td>
</tr></table>
<p style="margin:10px 0 0;font-size:16px;font-weight:bold;line-height:1.3;color:#111827">${title}</p>
</td></tr>
${paragraphs.length ? `<tr><td style="padding:0 16px 4px">${paragraphs.join("")}</td></tr>` : ""}
${rows.length ? `<tr><td style="padding:4px 16px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #F0F1F3;border-collapse:collapse">${rows.join("")}</table></td></tr>` : ""}
<tr><td style="padding:8px 16px;background:#F9FAFB;border-top:1px solid #F0F1F3;font-size:10px;line-height:1.5;color:#9CA3AF" align="center">Cashable Fund LLC · Reply to this email with any questions</td></tr>
</table></td></tr></table></body></html>`;
}
