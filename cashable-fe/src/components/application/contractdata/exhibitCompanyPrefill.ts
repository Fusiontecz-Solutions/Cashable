import {
    EXHIBIT_A_ADDRESS_FIELD_KEYS,
    EXHIBIT_A_VALUE_COUNT,
    EXHIBIT_A_VALUE_FIELD_KEYS,
    type BuildContractPrefillFieldsArgs,
    type ExhibitAValueFieldKey,
} from "./Contract";

export function companiesFromPrefill(
    prefill: Partial<BuildContractPrefillFieldsArgs> | null | undefined,
): string[] {
    const loaded: string[] = [];
    for (const key of EXHIBIT_A_VALUE_FIELD_KEYS) {
        const v = String(prefill?.[key] ?? "").trim();
        if (v) loaded.push(v);
    }
    return loaded.length > 0 ? loaded : [""];
}

/** Addresses in the same order as companiesFromPrefill (one per company row). */
export function companyAddressesFromPrefill(
    prefill: Partial<BuildContractPrefillFieldsArgs> | null | undefined,
): string[] {
    const out: string[] = [];
    for (let i = 0; i < EXHIBIT_A_VALUE_COUNT; i++) {
        const name = String(prefill?.[EXHIBIT_A_VALUE_FIELD_KEYS[i]] ?? "").trim();
        if (name) out.push(String(prefill?.[EXHIBIT_A_ADDRESS_FIELD_KEYS[i]] ?? "").trim());
    }
    return out.length > 0 ? out : [""];
}

export function companiesToPrefillPayload(
    companies: readonly string[],
    addresses: readonly string[] = [],
): Partial<BuildContractPrefillFieldsArgs> {
    const out: Partial<BuildContractPrefillFieldsArgs> = {};
    // Rows without a name are dropped (with their address), so a removed company leaves no gap.
    const rows = companies
        .map((name, i) => ({ name: String(name ?? "").trim(), address: String(addresses[i] ?? "").trim() }))
        .filter((r) => r.name);
    for (let i = 0; i < EXHIBIT_A_VALUE_COUNT; i++) {
        const key = EXHIBIT_A_VALUE_FIELD_KEYS[i] as ExhibitAValueFieldKey;
        out[key] = rows[i]?.name ?? "";
        out[EXHIBIT_A_ADDRESS_FIELD_KEYS[i]] = rows[i]?.address ?? "";
    }
    return out;
}

/** Map company name rows to indexed pairs for UI lists. */
export function mapExhibitCompanyNames(names: readonly string[]): Array<{ name: string; index: number }> {
    return names.map((name: string, index: number) => ({ name, index }));
}
