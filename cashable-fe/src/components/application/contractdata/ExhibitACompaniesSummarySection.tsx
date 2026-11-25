import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/redux/store";
import { getByApplicationIdContract, updateContract } from "@/redux/actions/contractActions";
import { toast } from "react-toastify";
import { EXHIBIT_A_VALUE_COUNT, type BuildContractPrefillFieldsArgs } from "./Contract";
import { companiesFromPrefill, companiesToPrefillPayload, companyAddressesFromPrefill } from "./exhibitCompanyPrefill";
import {
    DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY,
    stripDocumentTemplateBlobFromPrefillOverrides,
} from "./documentTemplateMappingPrefill";

function parsePositiveContractId(id: number | string | null | undefined): number | null {
    if (id === null || id === undefined) return null;
    const n = typeof id === "number" ? id : Number(String(id).trim());
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
    return n;
}

export type ExhibitACompaniesSummarySectionProps = {
    contractId: number | string | null;
    applicationUuid?: string | null;
    canEdit: boolean;
    prefillOverridesReady: boolean;
    persistedPrefillOverrides?: Partial<BuildContractPrefillFieldsArgs> | null;
    documentTemplatePrefillByMappingId?: Record<string, Record<string, string>>;
    onPersistedPrefillChange?: (next: Partial<BuildContractPrefillFieldsArgs> | null) => void;
    onPersistedPrefillFullChange?: (full: Record<string, unknown> | null) => void;
    onDraftInvalidate?: () => void;
};

export function ExhibitACompaniesSummarySection({
    contractId,
    applicationUuid,
    canEdit,
    prefillOverridesReady,
    persistedPrefillOverrides,
    documentTemplatePrefillByMappingId = {},
    onPersistedPrefillChange,
    onPersistedPrefillFullChange,
    onDraftInvalidate,
}: ExhibitACompaniesSummarySectionProps) {
    const dispatch = useDispatch<AppDispatch>();
    const [companies, setCompanies] = useState<string[]>([""]);
    /** Address per company row (prints next to it on Exhibit A only). */
    const [addresses, setAddresses] = useState<string[]>([""]);
    const [saving, setSaving] = useState(false);

    // Load from the deal only when its saved Exhibit A values change: the page refreshes the
    // contract in the background (a new object each time), which must not wipe what is being typed.
    const loadedSignatureRef = useRef<string | null>(null);
    useEffect(() => {
        if (!prefillOverridesReady) return;
        const names = companiesFromPrefill(persistedPrefillOverrides);
        const addrs = companyAddressesFromPrefill(persistedPrefillOverrides);
        const signature = JSON.stringify([names, addrs]);
        if (signature === loadedSignatureRef.current) return;
        loadedSignatureRef.current = signature;
        setCompanies(names);
        setAddresses(addrs);
    }, [prefillOverridesReady, persistedPrefillOverrides]);

    const updateAddress = useCallback((index: number, value: string) => {
        setAddresses((prev) => {
            const next = [...prev];
            while (next.length <= index) next.push("");
            next[index] = value;
            return next;
        });
    }, []);

    const updateRow = useCallback((index: number, value: string) => {
        setCompanies((prev) => prev.map((c, i) => (i === index ? value : c)));
    }, []);

    const addRow = useCallback(() => {
        setCompanies((prev) => {
            if (prev.length >= EXHIBIT_A_VALUE_COUNT) return prev;
            return [...prev, ""];
        });
    }, []);

    const removeRow = useCallback((index: number) => {
        setCompanies((prev) => {
            if (prev.length <= 1) return [""];
            return prev.filter((_, i) => i !== index);
        });
        setAddresses((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index)));
    }, []);

    /** Rows as they will be saved (blank rows dropped), for comparing with what the deal has. */
    const rowsSignature = (names: readonly string[], addrs: readonly string[]) => {
        const payload = companiesToPrefillPayload(names, addrs);
        return JSON.stringify([companiesFromPrefill(payload), companyAddressesFromPrefill(payload)]);
    };

    // Auto-save: added / edited / removed companies reach the deal (prefill Exhibit A, every COJ
    // and the contract sent to BoldSign) without a separate Save click.
    const latestRowsRef = useRef({ companies, addresses });
    latestRowsRef.current = { companies, addresses };
    useEffect(() => {
        if (!prefillOverridesReady || !canEdit || saving) return;
        if (parsePositiveContractId(contractId) == null) return;
        if (loadedSignatureRef.current == null) return;
        if (rowsSignature(companies, addresses) === loadedSignatureRef.current) return;
        const timer = window.setTimeout(() => void handleSave(true), 800);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companies, addresses, prefillOverridesReady, canEdit, saving, contractId]);

    const handleSave = async (silent = false) => {
        const cid = parsePositiveContractId(contractId);
        if (cid == null) {
            toast.error("Create or open a contract for this application before saving Exhibit A names.");
            return;
        }
        // What is being saved — so the deal's refreshed copy is not loaded back over newer typing.
        const savingRows = latestRowsRef.current;
        loadedSignatureRef.current = rowsSignature(savingRows.companies, savingRows.addresses);
        setSaving(true);
        try {
            const base =
                stripDocumentTemplateBlobFromPrefillOverrides(persistedPrefillOverrides) ??
                ({} as Partial<BuildContractPrefillFieldsArgs>);
            const exhibitPayload = companiesToPrefillPayload(savingRows.companies, savingRows.addresses);
            const contractPrefillOverrides: Record<string, unknown> = {
                ...base,
                ...exhibitPayload,
                [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]: documentTemplatePrefillByMappingId,
            };
            const updateRes = await dispatch(
                updateContract({
                    id: cid,
                    data: { contractPrefillOverrides },
                }),
            ).unwrap();
            const updatedContract = (updateRes as { data?: unknown })?.data ?? updateRes;
            const fromUpdate = (updatedContract as { contractPrefillOverrides?: unknown } | null)
                ?.contractPrefillOverrides;
            const fullSaved =
                fromUpdate != null && typeof fromUpdate === "object" && !Array.isArray(fromUpdate)
                    ? (fromUpdate as Record<string, unknown>)
                    : contractPrefillOverrides;
            const mainSaved =
                stripDocumentTemplateBlobFromPrefillOverrides(fullSaved) ??
                ({ ...base, ...exhibitPayload } as Partial<BuildContractPrefillFieldsArgs>);
            onPersistedPrefillChange?.(mainSaved);
            onPersistedPrefillFullChange?.(fullSaved);
            onDraftInvalidate?.();
            loadedSignatureRef.current = JSON.stringify([
                companiesFromPrefill(mainSaved),
                companyAddressesFromPrefill(mainSaved),
            ]);
            if (!silent) {
                // Manual save: show the rows exactly as saved (blank rows dropped).
                setCompanies(companiesFromPrefill(mainSaved));
                setAddresses(companyAddressesFromPrefill(mainSaved));
            }
            // Refresh the deal in the background (the local snapshot is already up to date).
            const appKey = String(applicationUuid ?? "").trim();
            if (appKey) void dispatch(getByApplicationIdContract(appKey));
            if (!silent) toast.success("Exhibit A company names saved.");
        } catch (e: unknown) {
            const msg =
                typeof e === "string"
                    ? e
                    : String((e as { message?: string })?.message ?? "Failed to save Exhibit A names.");
            // Not saved: the next edit tries again (no automatic retry loop on a persistent error).
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    if (!prefillOverridesReady) {
        return (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic py-1">
                Loading contract prefill…
            </p>
        );
    }

    const atMax = companies.length >= EXHIBIT_A_VALUE_COUNT;

    return (
        <div className="space-y-3">
            <div>
                <span className="text-blue-600 font-bold text-[11px] uppercase">
                    Exhibit A — company names
                </span>
                <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                    Add up to {EXHIBIT_A_VALUE_COUNT} companies.
                </p>
            </div>

            <div className="space-y-2">
                {companies.map((name, index) => (
                    <div key={`exhibit-row-${index}`} className="flex items-end gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                            <Label
                                htmlFor={`summary-exhibit-${index}`}
                                className="text-xs text-slate-600 dark:text-slate-400"
                            >
                                Company {index + 1}
                            </Label>
                            <Input
                                id={`summary-exhibit-${index}`}
                                className="h-8 text-sm"
                                value={name}
                                onChange={(e) => updateRow(index, e.target.value)}
                                disabled={!canEdit || saving}
                                placeholder="Company legal name"
                            />
                            <Input
                                id={`summary-exhibit-address-${index}`}
                                aria-label={`Company ${index + 1} address`}
                                className="h-8 text-sm"
                                value={addresses[index] ?? ""}
                                onChange={(e) => updateAddress(index, e.target.value)}
                                disabled={!canEdit || saving}
                                placeholder="Company address (prints next to it on Exhibit A)"
                            />
                        </div>
                        {canEdit && companies.length > 1 ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-slate-500 hover:text-red-600"
                                onClick={() => removeRow(index)}
                                disabled={saving}
                                aria-label={`Remove company ${index + 1}`}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        ) : (
                            <div className="h-8 w-8 shrink-0" aria-hidden />
                        )}
                    </div>
                ))}
            </div>

            {canEdit ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={addRow}
                    disabled={saving || atMax}
                    title={atMax ? `Maximum ${EXHIBIT_A_VALUE_COUNT} companies` : "Add company"}
                >
                    <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Add company
                </Button>
            ) : null}

            {canEdit ? (
                <div className="flex justify-end pt-1">
                    <Button
                        type="button"
                        size="sm"
                        className="h-8"
                        onClick={() => void handleSave()}
                        disabled={saving || parsePositiveContractId(contractId) == null}
                    >
                        {saving ? (
                            <>
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                                Saving…
                            </>
                        ) : (
                            "Save Exhibit A names"
                        )}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
