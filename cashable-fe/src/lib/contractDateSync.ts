import { DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY } from "@/components/application/contractdata/documentTemplateMappingPrefill";

/** Deal-level (Verify Prefill) date fields every document prints. */
const CONTRACT_DATE_PREFILL_KEYS = [
    "agreementDate",
    "authorizationClientDate",
    "achAuthorizationAccountHolderDate",
    "achAuthorizationConcentAccountHolderDate",
    "addendumDated",
    "addendumDatedPrincipalOwner1Date",
    "addendumDatedPrincipalOwner2Date",
    // Some addendum builders read the snake_case id first.
    "agreement_date",
    "addendum_date",
] as const;

/** Per-document (mapping) date fields — never personal dates (birth, business start, …). */
const CONTRACT_DATE_FIELD_IDS = new Set([
    "agreement_date",
    "signature_date",
    "Signature_date",
    "disclosure_date",
    "addendum_date",
    "addendum_dated",
    "financial_date",
    "loan_agreement_dated",
    "coj_date",
    "authorization_client_date",
    "ach_authorization_account_holder_date",
    "ach_authorization_concent_account_holder_date",
    "addendum_dated_principal_owner1_date",
    "addendum_dated_principal_owner2_date",
]);

/** "2026-11-25" → "11/25/2026" (the format the contracts print). */
export function ymdToUsDate(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? "").trim());
    return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
}

/** "11/25/2026" (or an ISO date) → "2026-11-25" for a date input; "" when not a date. */
export function usDateToYmd(raw: unknown): string {
    const s = String(raw ?? "").trim();
    let m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
    if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

/**
 * The contract's prefill with one date on every document: the deal's agreement / signing dates
 * and each document mapping's own date fields (contract, COJ, ACH, addendum, disclosure).
 */
export function applyContractDocumentDate(
    rawOverrides: Record<string, unknown> | null | undefined,
    usDate: string,
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...(rawOverrides ?? {}) };
    for (const key of CONTRACT_DATE_PREFILL_KEYS) out[key] = usDate;
    const blob = out[DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY];
    if (blob && typeof blob === "object" && !Array.isArray(blob)) {
        const next: Record<string, unknown> = {};
        for (const [mappingId, values] of Object.entries(blob as Record<string, unknown>)) {
            if (!values || typeof values !== "object" || Array.isArray(values)) {
                next[mappingId] = values;
                continue;
            }
            const v: Record<string, unknown> = { ...(values as Record<string, unknown>) };
            for (const key of Object.keys(v)) if (CONTRACT_DATE_FIELD_IDS.has(key)) v[key] = usDate;
            next[mappingId] = v;
        }
        out[DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY] = next;
    }
    return out;
}
