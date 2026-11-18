/** Platform PDF + coordinate layouts — PDF bytes from BoldSignTemplate.pdfUrl (Cloudinary). */

import { APP_COMPANY_NAME, isPlatformBrandName } from "@/constants/appBranding";
import { DOCUSIGN_PRIMARY_SIGNER_ROLE } from "./docusignTemplateConfig";

export const PLATFORM_LAYOUT_KEYS = {
    contract: "contract",
    texasFundingGroupContract: "texas_funding_group_contract",
    flexAddendum: "flex_addendum",
    prePaymentAddendum: "pre_payment_addendum",
    balanceTransfer: "balance_transfer",
    caseTakeoverAddendum: "case_takeover_addendum",
    achAuthorization: "ach_authorization",
    achAuthorizationTexas: "ach_authorization_texas",
    waiverPersonalService: "waiver_personal_service",
    depositControl: "deposit_control",
    depositControlNyTx: "deposit_control_ny_tx",
    cojNyGeneral: "coj_ny_general",
    cojNyBusiness: "coj_ny_business",
    cojNyMerchant: "coj_ny_merchant",
    cojIowa: "coj_iowa",
    prepayDiscount: "prepay_discount",
} as const;

export type PlatformLayoutKey =
    (typeof PLATFORM_LAYOUT_KEYS)[keyof typeof PLATFORM_LAYOUT_KEYS];

/** Legal funder name on state disclosure forms (not Contract.funderName legacy variants). */
export const PLATFORM_DISCLOSURE_FUNDER_NAME = APP_COMPANY_NAME;

/** Dropbox Sign envelope role names — must match template / backend DOCUSIGN_DEFAULT_ROLE_NAME. */
export const PLATFORM_PRIMARY_SIGNER_ROLE = DOCUSIGN_PRIMARY_SIGNER_ROLE;
export const PLATFORM_SECONDARY_SIGNER_ROLE = "Owner 2";

export const PLATFORM_SIGNER_SLOTS = [
    { roleIndex: 1, roleName: PLATFORM_PRIMARY_SIGNER_ROLE, signerOrder: 1 },
    { roleIndex: 2, roleName: PLATFORM_SECONDARY_SIGNER_ROLE, signerOrder: 2 },
] as const;

export type SupplementalDocumentOption = {
    layoutKey: PlatformLayoutKey;
    label: string;
};

export const SUPPLEMENTAL_DOCUMENT_OPTIONS: SupplementalDocumentOption[] = [
    { layoutKey: PLATFORM_LAYOUT_KEYS.achAuthorization, label: "ACH Authorization" },
    {
        layoutKey: PLATFORM_LAYOUT_KEYS.depositControl,
        label: "Deposit Control Agreement (All Other States)",
    },
    {
        layoutKey: PLATFORM_LAYOUT_KEYS.depositControlNyTx,
        label: "Deposit Control Agreement (NY & TX)",
    },
    {
        layoutKey: PLATFORM_LAYOUT_KEYS.waiverPersonalService,
        label: "Waiver of Personal Service (NY)",
    },
    { layoutKey: PLATFORM_LAYOUT_KEYS.cojNyGeneral, label: "COJ — NY General" },
    { layoutKey: PLATFORM_LAYOUT_KEYS.cojNyBusiness, label: "COJ — NY Business only" },
    { layoutKey: PLATFORM_LAYOUT_KEYS.cojNyMerchant, label: "COJ — NY Individual only" },
    { layoutKey: PLATFORM_LAYOUT_KEYS.cojIowa, label: "COJ — Iowa" },
    { layoutKey: PLATFORM_LAYOUT_KEYS.prepayDiscount, label: "Prepay Discount" },
];

/**
 * Upload-gated addendums — shown in Create Contract only after the funder
 * uploads that PDF on their profile (Settings → Funder → Addendum PDFs).
 */
export const UPLOAD_GATED_ADDENDUM_DOCUMENT_OPTIONS: SupplementalDocumentOption[] = [];

/** Addendum picker — includes ACH so it can attach with the contract; standalone ACH modal remains separate. */
export const CONTRACT_ADDENDUM_DOCUMENT_OPTIONS: SupplementalDocumentOption[] =
    SUPPLEMENTAL_DOCUMENT_OPTIONS;

export function isAchAuthorizationLayoutKey(value: unknown): boolean {
    const key = String(value ?? "")
        .trim()
        .toLowerCase();
    return (
        key === PLATFORM_LAYOUT_KEYS.achAuthorization ||
        key === PLATFORM_LAYOUT_KEYS.achAuthorizationTexas ||
        key.includes("ach_authorization") ||
        key.includes("ach-authorization")
    );
}

export function isTexasAchAuthorizationLayoutKey(value: unknown): boolean {
    const key = String(value ?? "")
        .trim()
        .toLowerCase();
    return (
        key === PLATFORM_LAYOUT_KEYS.achAuthorizationTexas ||
        key.includes("ach_authorization_texas") ||
        key.includes("texas_ach")
    );
}

const LAYOUT_KEY_SET = new Set<string>(Object.values(PLATFORM_LAYOUT_KEYS));

export function isPlatformLayoutKey(value: unknown): value is PlatformLayoutKey {
    return LAYOUT_KEY_SET.has(String(value ?? "").trim());
}

/** Texas-only funders (and legacy Texas Funding Group) use the 13-page contract layout. */
export function isTexasContractState(state?: string | null): boolean {
    const normalized = String(state ?? "")
        .trim()
        .toLowerCase();
    return normalized === "texas" || normalized === "tx";
}

export const TEXAS_FUNDING_GROUP_FUNDER_LABEL = "TEXAS FUNDING GROUP";

export function isTexasFundingGroupFunder(funderName?: string | null): boolean {
    const normalized = String(funderName ?? "")
        .trim()
        .toLowerCase();
    return normalized.includes("texas funding group");
}

export function resolveMainContractLayoutKey(
    funderName?: string | null,
    state?: string | null,
): PlatformLayoutKey {
    if (funderName && isPlatformBrandName(funderName)) {
        return PLATFORM_LAYOUT_KEYS.contract;
    }
    if (isTexasFundingGroupFunder(funderName) && isTexasContractState(state)) {
        return PLATFORM_LAYOUT_KEYS.texasFundingGroupContract;
    }
    return PLATFORM_LAYOUT_KEYS.contract;
}

/** Layout envelope slots — Owner 2 only when a second owner/signer is active. */
export function getPlatformSignerRoleRows(
    ownerCount = 1,
): Array<Record<string, unknown>> {
    const slots =
        ownerCount >= 2
            ? PLATFORM_SIGNER_SLOTS
            : PLATFORM_SIGNER_SLOTS.filter(
                  (s) => s.roleName === PLATFORM_PRIMARY_SIGNER_ROLE,
              );
    return slots.map((slot, idx) => ({
        roleIndex: idx + 1,
        roleName: slot.roleName,
        signerOrder: slot.signerOrder,
        signerName: "",
        signerEmail: "",
    }));
}

export function supplementalOptionLabel(layoutKey: string): string {
    const found = SUPPLEMENTAL_DOCUMENT_OPTIONS.find((o) => o.layoutKey === layoutKey);
    return found?.label || layoutKey;
}

/** NY-only documents (Cashable LLC entity, NY law). */
const NY_ONLY_LAYOUT_KEYS = new Set<string>([
    PLATFORM_LAYOUT_KEYS.waiverPersonalService,
    PLATFORM_LAYOUT_KEYS.cojNyGeneral,
    PLATFORM_LAYOUT_KEYS.cojNyBusiness,
    PLATFORM_LAYOUT_KEYS.cojNyMerchant,
]);

/**
 * Filter supplemental documents by the deal's contract state:
 * - NY: NY COJs + Waiver + NY&TX Deposit Control (no Iowa COJ / all-states DCA)
 * - TX: NY&TX Deposit Control only (no COJ, no NY-law waiver)
 * - other states (Cashable Fund LLC): Iowa COJ + all-states Deposit Control
 * Unknown/empty state shows everything.
 */
export function filterSupplementalOptionsForState<T extends { layoutKey: string }>(
    options: T[],
    state?: string | null,
    funderName?: string | null,
): T[] {
    const s = String(state ?? "").trim().toUpperCase();
    let isNy = s === "NY" || s === "NEW YORK";
    let isTx = s === "TX" || s === "TEXAS";
    if (!s) {
        // No state yet - fall back to the funding entity. Cashable LLC is the
        // NY/TX entity (show the NY/TX set); Cashable Fund LLC is all others.
        const f = String(funderName ?? "").trim().toLowerCase();
        if (!f) return options;
        if (f.includes("fund")) {
            isNy = false;
            isTx = false;
        } else if (f.includes("cashable")) {
            isNy = true; // NY superset (includes the NY&TX deposit control)
        } else {
            return options;
        }
    }
    return options.filter((opt) => {
        const key = opt.layoutKey;
        if (isNy) {
            return key !== PLATFORM_LAYOUT_KEYS.cojIowa && key !== PLATFORM_LAYOUT_KEYS.depositControl;
        }
        if (isTx) {
            return (
                !NY_ONLY_LAYOUT_KEYS.has(key) &&
                key !== PLATFORM_LAYOUT_KEYS.cojIowa &&
                key !== PLATFORM_LAYOUT_KEYS.depositControl
            );
        }
        return !NY_ONLY_LAYOUT_KEYS.has(key) && key !== PLATFORM_LAYOUT_KEYS.depositControlNyTx;
    });
}
