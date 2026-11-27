import { trackContractSave } from "@/lib/pendingContractSaves";
import { toPrefillUppercase } from "./prefillUppercase";
import { signingProviderName } from "@/lib/signingProvider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UsCurrencyInput, isUsCurrencyEditField } from "@/components/ui/us-currency-input";
import type { AppDispatch } from "@/redux/store";
import {
    getByApplicationIdContract,
    getAllACH,
    updateACH,
    updateContract,
} from "@/redux/actions/contractActions";
import { toast } from "react-toastify";
import { Download, FileDown } from "lucide-react";
import { axiosPost } from "@/redux/axios";
import { isNewYorkCojTemplate } from "@/lib/cojBold";
import type {
    BuildContractPrefillFieldsArgs,
    ContractPrefillContractRecords,
} from "./Contract";
import {
    CONTRACT_PREFILL_COLUMN_SYNC_KEYS,
    stripStaleOfferOverridesFromPersisted,
} from "./Contract";
import {
    ACH_PREFILL_MAPPING_ALIAS_KEY,
    achCamelPartialToAchRecordPatch,
    achTabValuesToCamelPartial,
    resolveAchSavedMappingOverrides,
} from "./achFormEditConfig";
import {
    DOCUMENT_TEMPLATE_ENVELOPE_BY_MAPPING_ID_KEY,
    DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY,
    parseDocumentTemplateEnvelopeByMappingId,
    parseDocumentTemplatePrefillByMappingId,
    getDocumentTemplatePrefillFieldRowsForEditor,
    usesCoordinateLayoutTemplate,
    withOfferDecisionSnapshot,
} from "./documentTemplateMappingPrefill";
import { stripAchAuthorizationKeysFromRecord } from "./documentPrefillScope";
import { COJ_BOLD_GROUPS, COJ_LINE_SPACINGS, cojBoldSet, isCojBoldKey, isCojLineSpacingKey, toggleCojBold } from "@/lib/cojBold";

export type TemplateMappingPrefillEditRow = {
    id: string;
    contractId: number;
    templateId: string;
    documentType: string;
    template?: {
        id?: string;
        name?: string | null;
        type?: string;
        layoutKey?: string | null;
        state?: string | null;
        frequency?: string | null;
        templateId?: string;
        pdfUrl?: string | null;
    } | null;
};

type TemplateMappingPrefillEditDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    row: TemplateMappingPrefillEditRow | null;
    /** CRM `Contract.id`. */
    contractId: number | null;
    applicationUuid?: string | null;
    applicationData: unknown;
    resolvedContract: Record<string, unknown> | null;
    contractRecords?: ContractPrefillContractRecords;
    /** Agreement / disclosure date default (e.g. today). */
    agreementDate: string;
    /** Full map: mapping row id → BoldSign field id → value. */
    documentTemplatePrefillByMappingId: Record<string, Record<string, string>>;
    /** Main contract prefill overrides (without document mapping blob); merged on save. */
    mainPrefillOverrides: Partial<BuildContractPrefillFieldsArgs> | null;
    /** Live Offer Decision — drives funding / payback on addendum + disclosure editors. */
    offerDecision?: Record<string, unknown> | null;
    /**
     * Optional title suffix (e.g. selected funder name for ACH).
     * When set, replaces the template name in the dialog title.
     */
    titleSuffix?: string | null;
    /** Pass false when the contract has more than one ACH form. */
    allowAchAliasFallback?: boolean;
    /** After a successful save, parent refreshes contract + mapping list. */
    onSaved: (savedTabValues?: Record<string, string>) => void;
};

export function TemplateMappingPrefillEditDialog({
    open,
    onOpenChange,
    row,
    contractId,
    applicationUuid = null,
    applicationData,
    resolvedContract,
    contractRecords,
    agreementDate,
    documentTemplatePrefillByMappingId,
    mainPrefillOverrides,
    offerDecision = null,
    titleSuffix = null,
    allowAchAliasFallback = true,
    onSaved,
}: TemplateMappingPrefillEditDialogProps) {
    const dispatch = useDispatch<AppDispatch>();
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    /** Only hydrate once per open/row — contract status polls must not wipe in-progress edits. */
    const hydratedSessionKeyRef = useRef<string | null>(null);

    const coordinateLayout = usesCoordinateLayoutTemplate(row);

    /** New York COJs are PDF only: downloaded here and emailed, never sent through BoldSign. */
    const isNyCoj = isNewYorkCojTemplate(row?.template?.layoutKey, row?.template?.name);
    const [downloadingPdf, setDownloadingPdf] = useState(false);

    const effectiveMainPrefillOverrides = useMemo(
        () =>
            stripStaleOfferOverridesFromPersisted(
                mainPrefillOverrides,
                offerDecision,
                applicationData,
                resolvedContract,
            ),
        [mainPrefillOverrides, offerDecision, applicationData, resolvedContract],
    );

    const editorRows = useMemo(() => {
        if (!row) return [];
        const saved = coordinateLayout
            ? resolveAchSavedMappingOverrides(documentTemplatePrefillByMappingId, row.id, {
                  allowAliasFallback: allowAchAliasFallback,
              })
            : (documentTemplatePrefillByMappingId[row.id] ?? {});
        return getDocumentTemplatePrefillFieldRowsForEditor({
            templateId: row.template?.templateId ?? null,
            templateName: row.template?.name ?? null,
            templateType: row.template?.type ?? row.documentType ?? null,
            templateLayoutKey: row.template?.layoutKey ?? null,
            templateState: row.template?.state ?? null,
            templateFrequency: row.template?.frequency ?? null,
            fallbackState:
                String((resolvedContract as { state?: unknown } | null)?.state ?? "").trim() || null,
            fallbackFrequency:
                String(
                    (resolvedContract as { disclosureFrequency?: unknown } | null)
                        ?.disclosureFrequency ?? "",
                ).trim() || null,
            documentType: row.documentType ?? null,
            contract: resolvedContract,
            application: applicationData as Record<string, unknown> | null,
            offerDecision,
            contractRecords,
            agreementDate,
            mainPrefillOverrides: effectiveMainPrefillOverrides ?? undefined,
            savedOverridesForMapping: saved,
            bankDetail: contractRecords?.bankDetail ?? null,
        });
    }, [
        row,
        coordinateLayout,
        documentTemplatePrefillByMappingId,
        resolvedContract,
        applicationData,
        offerDecision,
        contractRecords,
        agreementDate,
        effectiveMainPrefillOverrides,
        allowAchAliasFallback,
    ]);

    /**
     * What each field would be from the deal alone (main prefill + CRM), without this document's
     * saved edits. Save keeps only fields that differ from it, so later prefill changes still
     * reach this document.
     */
    const dealValues = useMemo(() => {
        if (!row) return {} as Record<string, string>;
        const rows = getDocumentTemplatePrefillFieldRowsForEditor({
            templateId: row.template?.templateId ?? null,
            templateName: row.template?.name ?? null,
            templateType: row.template?.type ?? row.documentType ?? null,
            templateLayoutKey: row.template?.layoutKey ?? null,
            templateState: row.template?.state ?? null,
            templateFrequency: row.template?.frequency ?? null,
            fallbackState:
                String((resolvedContract as { state?: unknown } | null)?.state ?? "").trim() || null,
            fallbackFrequency:
                String(
                    (resolvedContract as { disclosureFrequency?: unknown } | null)
                        ?.disclosureFrequency ?? "",
                ).trim() || null,
            documentType: row.documentType ?? null,
            contract: resolvedContract,
            application: applicationData as Record<string, unknown> | null,
            offerDecision,
            contractRecords,
            agreementDate,
            mainPrefillOverrides: effectiveMainPrefillOverrides ?? undefined,
            savedOverridesForMapping: {},
            bankDetail: contractRecords?.bankDetail ?? null,
        });
        return Object.fromEntries(rows.map((r) => [r.id, String(r.value ?? "")]));
    }, [row, resolvedContract, applicationData, offerDecision, contractRecords, agreementDate, effectiveMainPrefillOverrides]);
    const sameAsDeal = (id: string, value: unknown) =>
        String(value ?? "").trim().toUpperCase() === String(dealValues[id] ?? "").trim().toUpperCase();
    const changedFromDeal = editorRows.filter((r) => r.id in dealValues && !sameAsDeal(r.id, fieldValues[r.id])).map((r) => r.id);

    useEffect(() => {
        if (!open || !row) {
            hydratedSessionKeyRef.current = null;
            return;
        }
        const sessionKey = String(row.id);
        if (hydratedSessionKeyRef.current === sessionKey) return;
        if (editorRows.length === 0) return;
        hydratedSessionKeyRef.current = sessionKey;
        setFieldValues(Object.fromEntries(editorRows.map((r) => [r.id, r.value ?? ""])));
    }, [open, row?.id, editorRows]);

    /** The filled NY COJ as a PDF, from the values on screen (unsaved edits included). */
    const handleDownloadNyCojPdf = useCallback(async () => {
        if (!row || !contractId) return;
        setDownloadingPdf(true);
        try {
            const values: Record<string, string> = {};
            for (const r of editorRows) values[r.id] = String(fieldValues[r.id] ?? r.value ?? "");
            const res = await axiosPost(
                `/pearsign/contracts/${contractId}/coj-pdf`,
                { layoutKey: row.template?.layoutKey ?? "", templateName: row.template?.name ?? "", values },
                { responseType: "blob" },
            );
            const disposition = String((res.headers as Record<string, unknown>)?.["content-disposition"] ?? "");
            const name = /filename="([^"]+)"/.exec(disposition)?.[1] || "COJ - New York.pdf";
            const url = URL.createObjectURL(res.data as Blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
            toast.success(`${name} downloaded.`);
        } catch (error: unknown) {
            let message = "Could not build the COJ PDF.";
            const data = (error as { response?: { data?: unknown } })?.response?.data;
            if (data instanceof Blob) {
                try {
                    message = (JSON.parse(await data.text()) as { message?: string }).message || message;
                } catch {
                    /* not JSON */
                }
            }
            toast.error(message);
        } finally {
            setDownloadingPdf(false);
        }
    }, [row, contractId, editorRows, fieldValues]);

    const handleSave = useCallback(async () => {
        const cid = contractId != null && Number.isFinite(Number(contractId)) ? Number(contractId) : null;
        if (cid == null || !row?.id) {
            toast.error("Missing contract or mapping row.");
            return;
        }
        setSaving(true);
        try {
            const rawOverrides =
                resolvedContract?.contractPrefillOverrides &&
                typeof resolvedContract.contractPrefillOverrides === "object" &&
                !Array.isArray(resolvedContract.contractPrefillOverrides)
                    ? {
                          ...(resolvedContract.contractPrefillOverrides as Record<
                              string,
                              unknown
                          >),
                      }
                    : {};

            const existingBlob = parseDocumentTemplatePrefillByMappingId(rawOverrides);
            const envelopeBlob = parseDocumentTemplateEnvelopeByMappingId(rawOverrides);

            // Only what was changed for this document; everything else keeps following the deal.
            const tabValues = Object.fromEntries(
                Object.entries(fieldValues).filter(([k, v]) => !(k in dealValues) || !sameAsDeal(k, v)),
            );
            // Balance Transfer Remaining RTR must map to its own Dropbox Sign data label —
            // never seed from purchase_price / payback.
            const remainingBalance = String(
                tabValues.balance_transfer_remaining_rtr_balance ??
                    tabValues.remaining_rtr_balance ??
                    "",
            ).trim();
            if (remainingBalance) {
                const layoutKey = String(row.template?.layoutKey ?? "").trim().toLowerCase();
                const templateName = String(row.template?.name ?? "").toLowerCase();
                const isBalanceTransfer =
                    layoutKey === "balance_transfer" ||
                    layoutKey.endsWith("_balance_transfer") ||
                    templateName.includes("balance transfer");
                if (isBalanceTransfer) {
                    tabValues.balance_transfer_remaining_rtr_balance = remainingBalance;
                    tabValues.remaining_rtr_balance = remainingBalance;
                    delete tabValues.purchase_price;
                    delete tabValues.balance_transfer_purchase_price;
                }
            }
            let nextBlob: Record<string, Record<string, string>> = {
                ...existingBlob,
                ...documentTemplatePrefillByMappingId,
                [row.id]: withOfferDecisionSnapshot(tabValues, offerDecision),
            };

            const achCamel = coordinateLayout ? achTabValuesToCamelPartial(tabValues) : null;
            if (coordinateLayout && achCamel && allowAchAliasFallback) {
                // Survive synthetic → real mapping id swaps. Skipped with several ACH
                // forms, where the alias would just hold the last edited form.
                nextBlob = {
                    ...nextBlob,
                    [ACH_PREFILL_MAPPING_ALIAS_KEY]: tabValues,
                };
            }

            const mainBase = { ...rawOverrides } as Record<string, unknown>;
            delete mainBase[DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY];
            delete mainBase[DOCUMENT_TEMPLATE_ENVELOPE_BY_MAPPING_ID_KEY];
            const main = coordinateLayout
                ? stripAchAuthorizationKeysFromRecord(mainBase)
                : mainBase;

            const contractPrefillOverrides: Record<string, unknown> = {
                ...main,
                [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]: nextBlob,
                ...(Object.keys(envelopeBlob).length
                    ? { [DOCUMENT_TEMPLATE_ENVELOPE_BY_MAPPING_ID_KEY]: envelopeBlob }
                    : {}),
            };

            const columnSync: Record<string, string> = {};
            // ACH form values live only in per-mapping blob — never write shared
            // authorization* / ACH columns (those merge across forms + overwrite Client).
            if (achCamel && !coordinateLayout) {
                for (const key of CONTRACT_PREFILL_COLUMN_SYNC_KEYS) {
                    if (!(key in achCamel)) continue;
                    columnSync[key] = String(achCamel[key] ?? "");
                }
            }

            const saveRequest = dispatch(
                updateContract({
                    id: cid,
                    data: {
                        contractPrefillOverrides,
                        ...columnSync,
                    },
                }),
            ).unwrap();

            // COJ / disclosure / addendum edits: close at once and finish the save in the
            // background (each server round trip costs about a second). Sending a contract waits
            // for it; a failure is reported so the document can be reopened.
            if (!(coordinateLayout && achCamel)) {
                const appKeyBg = String(applicationUuid ?? "").trim();
                void trackContractSave(saveRequest)
                    .then(() => {
                        if (appKeyBg) void dispatch(getByApplicationIdContract(appKeyBg));
                        onSaved(undefined);
                    })
                    .catch((err: unknown) => {
                        const msg =
                            err && typeof err === "object" && "message" in err
                                ? String((err as { message?: string }).message)
                                : typeof err === "string"
                                  ? err
                                  : "";
                        toast.error(`The document was not saved${msg ? `: ${msg}` : ""}. Open it again and save.`);
                    });
                toast.success("Saved.");
                onOpenChange(false);
                return;
            }
            await trackContractSave(saveRequest);

            // Persist ACH form fields onto the contract ACH row so Info Required
            // and later reloads match what was saved on this form.
            if (coordinateLayout && achCamel) {
                const achId = Number(
                    (contractRecords?.ach as { id?: unknown } | null | undefined)?.id,
                );
                if (Number.isFinite(achId) && achId > 0) {
                    const achPatch = achCamelPartialToAchRecordPatch(achCamel);
                    const hasAchData = Object.values(achPatch).some(Boolean);
                    if (hasAchData) {
                        try {
                            await dispatch(
                                updateACH({ id: achId, data: achPatch }),
                            ).unwrap();
                            await dispatch(getAllACH({ contractId: cid })).unwrap();
                        } catch (achErr) {
                            console.warn("[ACH] Failed to sync Info Required ACH row:", achErr);
                        }
                    }
                }
            }

            // Refresh the deal in the background: the dialog closes as soon as the save lands.
            const appKey = String(applicationUuid ?? "").trim();
            if (appKey) void dispatch(getByApplicationIdContract(appKey));

            toast.success(
                coordinateLayout
                    ? "ACH form field values saved."
                    : `Template mapping and ${signingProviderName()} field overrides saved.`,
            );
            onSaved(coordinateLayout ? tabValues : undefined);
            onOpenChange(false);
        } catch (e: unknown) {
            console.error(e);
            const msg =
                e && typeof e === "object" && "message" in e
                    ? String((e as { message?: string }).message)
                    : "Failed to save.";
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    }, [
        contractId,
        row,
        coordinateLayout,
        fieldValues,
        documentTemplatePrefillByMappingId,
        resolvedContract,
        contractRecords,
        dispatch,
        applicationUuid,
        onSaved,
        onOpenChange,
    ]);

    const overrideTitle = String(titleSuffix ?? "").trim();
    const titleName = overrideTitle
        ? overrideTitle
        : row?.template?.name?.trim()
          ? row.template.name
          : coordinateLayout
            ? "ACH authorization"
            : row?.template?.templateId || `${signingProviderName()} template`;

    const dialogTitle = coordinateLayout
        ? `Edit ACH form — ${titleName}`
        : `Edit template mapping — ${titleName}`;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="flex max-h-[90vh] w-[min(100vw-2rem,960px)] flex-col gap-0 p-0 sm:max-w-[960px]"
                onOpenAutoFocus={(e: any) => e.preventDefault()}
            >
                <DialogHeader className="shrink-0 border-b px-6 py-4">
                    <DialogTitle className="text-base">{dialogTitle}</DialogTitle>
                    {!coordinateLayout ? (
                        <p className="text-muted-foreground text-sm font-normal leading-snug">
                            Adjust field values used when prefilling this document. Values are saved on the
                            contract.
                        </p>
                    ) : null}
                </DialogHeader>
                <div className="max-h-[min(65vh,520px)] overflow-y-auto px-6 py-4">
                    <div className="space-y-4">
                        {isNyCoj ? (
                            <div className="flex flex-col gap-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-700 dark:bg-amber-950/40">
                                <div className="text-sm leading-relaxed text-amber-900 dark:text-amber-200">
                                    <div className="mb-0.5 flex items-center gap-1.5 font-bold">
                                        <FileDown className="h-4 w-4" aria-hidden />
                                        New York COJ: PDF only
                                    </div>
                                    Never sent through BoldSign. Check the values below, download the filled COJ and
                                    email it yourself. The oath&rsquo;s state / county and the notary section stay
                                    blank for the notary.
                                </div>
                                <Button
                                    type="button"
                                    size="lg"
                                    disabled={saving || downloadingPdf || !row || !contractId}
                                    onClick={() => void handleDownloadNyCojPdf()}
                                    className="h-11 shrink-0 gap-2 bg-amber-600 px-5 text-base font-semibold text-white shadow-md hover:bg-amber-700 focus-visible:ring-amber-500"
                                >
                                    <Download className="h-5 w-5" aria-hidden />
                                    {downloadingPdf ? "Preparing PDF…" : "Download PDF"}
                                </Button>
                            </div>
                        ) : null}
                        {editorRows.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                                No registered field map for this template. For state disclosures, set
                                BoldSignTemplate{" "}
                                <span className="font-mono text-xs">type=disclosure</span> with{" "}
                                <span className="font-mono text-xs">state</span> (e.g.{" "}
                                <span className="font-mono text-xs">florida</span>) and{" "}
                                <span className="font-mono text-xs">frequency</span> (
                                <span className="font-mono text-xs">daily</span> /{" "}
                                <span className="font-mono text-xs">weekly</span>), or name like{" "}
                                <span className="font-mono text-xs">daily_florida</span>. For ACH, ensure{" "}
                                <span className="font-mono text-xs">type=ach</span> or a layout key containing{" "}
                                <span className="font-mono text-xs">ach_authorization</span>.
                            </p>
                        ) : (
                            <>
                            {changedFromDeal.filter((id) => !isCojBoldKey(id)).length ? (
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                                    <span>
                                        {changedFromDeal.filter((id) => !isCojBoldKey(id)).length} field(s) here differ from the deal prefill, so prefill changes do not reach them.
                                    </span>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs"
                                        onClick={() =>
                                            setFieldValues((prev) => {
                                                const next = { ...prev };
                                                for (const id of changedFromDeal) if (!isCojBoldKey(id)) next[id] = dealValues[id] ?? "";
                                                return next;
                                            })
                                        }
                                    >
                                        Use deal values for all
                                    </Button>
                                </div>
                            ) : null}
                            <div className="grid gap-3 sm:grid-cols-2">
                                {editorRows.map((r) => (
                                    <div key={r.id} className="space-y-1.5">
                                        <Label htmlFor={`tmpl-field-${r.id}`} className="text-xs font-medium">
                                            {r.label}
                                        </Label>
                                        {isCojLineSpacingKey(r.id) ? (
                                            <select
                                                value={fieldValues[r.id] || "normal"}
                                                onChange={(e) => setFieldValues((prev) => ({ ...prev, [r.id]: e.target.value }))}
                                                className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                                            >
                                                {COJ_LINE_SPACINGS.map(([k, label]) => (
                                                    <option key={k} value={k}>
                                                        {label}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : isCojBoldKey(r.id) ? (
                                            <div className="flex flex-wrap gap-1" role="group" aria-label="Values printed in bold">
                                                {COJ_BOLD_GROUPS.map(([g, label]) => {
                                                    const on = cojBoldSet(fieldValues[r.id]).has(g);
                                                    return (
                                                        <button
                                                            key={g}
                                                            type="button"
                                                            aria-pressed={on}
                                                            onClick={() =>
                                                                setFieldValues((prev) => ({ ...prev, [r.id]: toggleCojBold(prev[r.id], g) }))
                                                            }
                                                            className={`rounded-md border px-2 py-1 text-xs ${
                                                                on
                                                                    ? "border-[var(--brand)] bg-[var(--brand)]/10 font-bold text-slate-900 dark:text-slate-100"
                                                                    : "border-slate-300 bg-white font-normal text-slate-500 dark:border-slate-700 dark:bg-slate-900"
                                                            }`}
                                                            title={on ? `${label}: bold — click for regular` : `${label}: regular — click for bold`}
                                                        >
                                                            {label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : isUsCurrencyEditField(r.id, r.label) ? (
                                            <UsCurrencyInput
                                                id={`tmpl-field-${r.id}`}
                                                value={fieldValues[r.id] ?? ""}
                                                onChange={(next) =>
                                                    setFieldValues((prev) => ({ ...prev, [r.id]: next }))
                                                }
                                            />
                                        ) : (
                                        <Input
                                            id={`tmpl-field-${r.id}`}
                                            value={toPrefillUppercase(fieldValues[r.id] ?? "", r.id)}
                                            onChange={(e) =>
                                                setFieldValues((prev) => ({ ...prev, [r.id]: toPrefillUppercase(e.target.value, r.id) }))
                                            }
                                        />
                                        )}
                                        {changedFromDeal.includes(r.id) && !isCojBoldKey(r.id) ? (
                                            <p className="flex flex-wrap items-center gap-1 text-[11px] text-sky-700 dark:text-sky-300">
                                                Only for this document · deal: {dealValues[r.id] || "(blank)"}
                                                <button
                                                    type="button"
                                                    className="font-medium text-[var(--brand)] hover:underline"
                                                    onClick={() => setFieldValues((prev) => ({ ...prev, [r.id]: dealValues[r.id] ?? "" }))}
                                                >
                                                    Use deal value
                                                </button>
                                            </p>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                            </>
                        )}
                    </div>
                </div>
                <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4">
                    {isNyCoj ? (
                        <Button
                            type="button"
                            disabled={saving || downloadingPdf || !row || !contractId}
                            onClick={() => void handleDownloadNyCojPdf()}
                            className="mr-auto gap-2 bg-amber-600 font-semibold text-white shadow-sm hover:bg-amber-700 focus-visible:ring-amber-500"
                        >
                            <Download className="h-4 w-4" aria-hidden />
                            {downloadingPdf ? "Preparing PDF…" : "Download PDF"}
                        </Button>
                    ) : null}
                    <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="button" disabled={saving || !row} onClick={() => void handleSave()}>
                        {saving ? "Saving…" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
