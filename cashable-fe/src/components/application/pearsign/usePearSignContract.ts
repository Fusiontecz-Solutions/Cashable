import { waitForPendingContractSaves } from "@/lib/pendingContractSaves";
import { useCallback, useEffect, useRef, useState } from "react";
import { signingProviderName } from "@/lib/signingProvider";
import { contractPdfFileName } from "@/lib/contractPdfFileName";
import { axiosGet, axiosPost, axiosPut } from "@/redux/axios";

/**
 * PearSign main-contract controller for the Create Contract modal (PDFViewerModal).
 *
 * Phase 1 of the Dropbox Sign → PearSign move: the funder's MAIN contract is a
 * PearSign template (registered per funder × owner count on the backend). The
 * Review flow mirrors Meridian:
 *
 *   openReview()  → POST /pearsign/contracts/:id/review   (CRM values + saved edits)
 *   <PearSignReviewModal> draws the values over the agreement and lets the user
 *   correct them (saved via PUT /overrides), then "Review done — Send via PearSign"
 *   → <PearSignSendDialog> → send() → POST /pearsign/contracts/:id/send
 *
 * Values are always recomputed on the server from the same prefill list the
 * Dropbox Sign send uses, so the browser never decides what gets sent.
 * The PearSign API key never reaches the browser.
 */

/** `fontSize`: the size this box is drawn and sent at (boxes sharing a value are sized separately). */
export type PearSignFieldBox = { key: string; page: number; x: number; y: number; width: number; height: number; fontSize?: number; disclosure?: boolean };
export type PearSignFieldStyle = { fontSize?: number };

/** Font sizes offered in Review (PearSign accepts 6–36pt). */
export const PEARSIGN_FONT_SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24] as const;

/**
 * ACH "On the following days" tick boxes (Mon–Fri / incl. holidays / seven days): an "X" in a
 * text field. Also matches package keys (`d2__ach_days_seven_check`).
 */
export function isPearSignTickBoxKey(key: string): boolean {
    return /(^|__)ach_days_[a-z_]+_check$/i.test(key);
}

/** Same rule as the server (pearSignHeightForFont): a box grows downward to fit its font size. */
export function pearSignHeightForFont(height: number, fontSize?: number | null): number {
    // PearSign's rule: a box must be at least ceil(fontSize / 0.75) tall (grown evenly; see server).
    return fontSize ? Math.max(height, Math.ceil(fontSize / 0.75)) : height;
}
export type PearSignSignerBox = PearSignFieldBox & { kind: string; roleName: string };

export type PearSignRecipient = { roleId: string; roleName: string; name: string; email: string };

export type PearSignState = {
    templateId?: string;
    envelopeId?: string;
    status?: string;
    sentAt?: string;
    completedAt?: string | null;
    customerSignedAt?: string | null;
    signedPdfUrl?: string | null;
    lastSyncedAt?: string;
    recipients?: PearSignRecipient[];
    overrides?: Record<string, string>;
    title?: string;
};

export type PearSignReview = {
    /** "package" = contract + addendums + disclosure in one envelope (staged by the package send path). */
    mode?: "contract" | "package";
    documents?: Array<{ index: number; name: string; startPage: number; pageCount: number }>;
    funderProfileId: string | null;
    funderName: string | null;
    templateId: string;
    templateName: string;
    ownerCount: number;
    signerRoles: Array<{ roleId: string; name: string; order: number }>;
    fields: Array<{ key: string; label: string; pages: number[]; document?: string }>;
    fieldLayout: PearSignFieldBox[];
    signerBoxes: Array<Omit<PearSignSignerBox, "key">>;
    crmValues: Record<string, string>;
    overrides: Record<string, string>;
    values: Record<string, string>;
    blankKeys: string[];
    /** Fields with their own value (page-1 EIN): clearing them keeps them blank instead of restoring the CRM value. */
    keepBlankKeys?: string[];
    /** Value keys whose edit rebuilds pages on the server (typed COJ values); reload the pages after saving. */
    rebuildKeys?: string[];
    /** Chosen font sizes per field key (unset = auto-fit). Sent to PearSign as the field's fontSize. */
    styles?: Record<string, PearSignFieldStyle>;
    /** Size each field is drawn and sent at: one size per page (server), Review choices included. */
    appliedStyles?: Record<string, PearSignFieldStyle>;
    recipients: PearSignRecipient[];
    blockers: string[];
    warnings: string[];
    state: PearSignState | null;
};

export type PearSignPayload = {
    funderProfileId: string;
    prefillFields: Array<{ id: string; value: string }>;
    roles: Array<Record<string, unknown>>;
    ownerCount?: number;
    contractState?: string | null;
};

const ACTIVE = new Set(["sent", "in_signing", "viewed", "signed", "partially_signed", "draft"]);

export function isActivePearSignStatus(status?: string | null): boolean {
    return ACTIVE.has(String(status || "").toLowerCase());
}

/** PearSign envelope ids are `env-<uuid>` (Dropbox Sign ids are hex, DocuSign bare GUIDs). */
export function isPearSignEnvelopeId(value?: string | null): boolean {
    return /^env-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

export function apiErrorMessage(e: unknown, fallback: string): string {
    const r = (e as { response?: { data?: unknown } })?.response?.data;
    if (r && typeof r === "object" && typeof (r as { message?: unknown }).message === "string") {
        return (r as { message: string }).message;
    }
    return e instanceof Error && e.message ? e.message : fallback;
}

/** Blob error bodies (responseType: "blob") carry JSON — read the message out of it. */
async function blobErrorMessage(e: unknown, fallback: string): Promise<string> {
    const data = (e as { response?: { data?: unknown } })?.response?.data;
    if (data instanceof Blob) {
        try {
            const parsed = JSON.parse(await data.text()) as { message?: string };
            if (parsed?.message) return parsed.message;
        } catch {
            /* not JSON */
        }
    }
    return apiErrorMessage(e, fallback);
}

export type PearSignController = ReturnType<typeof usePearSignContract>;

export function usePearSignContract(opts: {
    enabled: boolean;
    contractId: number | null;
    funderProfileId: string | null;
    /** Same inputs the Dropbox Sign send uses (prefill list, signer roles, state). */
    getPayload: () => PearSignPayload | null;
}) {
    const { enabled, contractId, funderProfileId } = opts;
    const getPayloadRef = useRef(opts.getPayload);
    getPayloadRef.current = opts.getPayload;

    const [available, setAvailable] = useState(false);
    const [state, setState] = useState<PearSignState | null>(null);
    const [review, setReview] = useState<PearSignReview | null>(null);
    const [busy, setBusy] = useState<null | "review" | "send" | "sync" | "void" | "download">(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<"contract" | "package">("contract");
    const prefetchedPreviewRef = useRef<Promise<Blob> | null>(null);
    const base = contractId ? `/pearsign/contracts/${contractId}` : "";
    const prefix = mode === "package" ? `${base}/package` : base;

    // Is a PearSign contract template registered for this funder?
    useEffect(() => {
        const id = String(funderProfileId || "").trim();
        if (!enabled || !id) {
            setAvailable(false);
            return;
        }
        let cancelled = false;
        axiosGet(`/pearsign/funders/${encodeURIComponent(id)}/status`)
            .then((res) => {
                if (!cancelled) setAvailable(Boolean(res?.data?.data?.enabled));
            })
            .catch(() => {
                if (!cancelled) setAvailable(false);
            });
        return () => {
            cancelled = true;
        };
    }, [enabled, funderProfileId]);

    // Saved PearSign state for this contract (envelope status chip, void / refresh).
    const loadState = useCallback(async () => {
        if (!contractId) return;
        try {
            const res = await axiosGet(`/pearsign/contracts/${contractId}`);
            setState((res?.data?.data?.state as PearSignState | null) ?? null);
        } catch {
            /* non-blocking */
        }
    }, [contractId]);

    useEffect(() => {
        if (!enabled || !available || !contractId) {
            setState(null);
            return;
        }
        void loadState();
    }, [enabled, available, contractId, loadState]);

    const payload = useCallback((): PearSignPayload => {
        const p = getPayloadRef.current();
        if (!p || !p.funderProfileId) throw new Error("Select a funder before reviewing the contract.");
        return p;
    }, []);

    const fetchReview = useCallback(async (): Promise<PearSignReview> => {
        if (!contractId) throw new Error("Save the contract before reviewing it.");
        await waitForPendingContractSaves();
        const res = await axiosPost(`/pearsign/contracts/${contractId}/review`, payload());
        const data = res?.data?.data as PearSignReview;
        setReview(data);
        setState(data.state ?? null);
        return data;
    }, [contractId, payload]);

    /** Build the Review (CRM values + saved edits) and open the preview modal. */
    const openReview = useCallback(async () => {
        prefetchedPreviewRef.current = null;
        setBusy("review");
        setError(null);
        try {
            await fetchReview();
            setMode("contract");
            setPreviewOpen(true);
        } catch (e) {
            const msg = apiErrorMessage(e, `Could not prepare the ${signingProviderName()} review.`);
            setError(msg);
            throw new Error(msg);
        } finally {
            setBusy(null);
        }
    }, [fetchReview]);

    /** Open the Review for the package staged by handleSend({ provider: "pearsign" }). */
    const openPackageReview = useCallback(async () => {
        if (!contractId) throw new Error("Save the contract before reviewing it.");
        await waitForPendingContractSaves();
        setBusy("review");
        setError(null);
        // Start the preview PDF in parallel so the document is ready when the modal opens.
        const previewPromise = axiosPost(
            `/pearsign/contracts/${contractId}/package/preview`,
            { drawValues: false },
            { responseType: "blob" },
        ).then((r) => {
            const blob = r?.data as Blob;
            if (!blob?.size || (blob.type && !blob.type.includes("pdf"))) throw new Error("The preview came back empty.");
            return blob;
        });
        previewPromise.catch(() => undefined); // modal falls back to a fresh request
        prefetchedPreviewRef.current = previewPromise;
        try {
            const res = await axiosGet(`/pearsign/contracts/${contractId}/package`);
            const data = res?.data?.data as PearSignReview;
            setMode("package");
            setReview(data);
            setState(data.state ?? null);
            setPreviewOpen(true);
        } catch (e) {
            prefetchedPreviewRef.current = null;
            const msg = apiErrorMessage(e, `Could not load the ${signingProviderName()} package review.`);
            setError(msg);
            throw new Error(msg);
        } finally {
            setBusy(null);
        }
    }, [contractId]);

    const closePreview = useCallback(() => {
        prefetchedPreviewRef.current = null;
        setPreviewOpen(false);
    }, []);

    /** One-shot: the agreement PDF prefetched by openPackageReview (signer boxes only). */
    const takePrefetchedPreview = useCallback((): Promise<Blob> | null => {
        const p = prefetchedPreviewRef.current;
        prefetchedPreviewRef.current = null;
        return p;
    }, []);

    /**
     * Preview PDF. `drawValues: false` → agreement with signer boxes only (the modal draws
     * values live). Otherwise the server-filled PDF of `values` (exactly what PearSign gets).
     */
    const fetchPreviewBlob = useCallback(
        async (options: { drawValues: boolean; values?: Record<string, string> }): Promise<Blob> => {
            if (!contractId) throw new Error("No contract.");
            try {
                const res = await axiosPost(
                    `${prefix}/preview`,
                    mode === "package"
                        ? { drawValues: options.drawValues, values: options.values }
                        : { ...payload(), drawValues: options.drawValues, values: options.values },
                    { responseType: "blob" },
                );
                const blob = res?.data as Blob;
                if (!blob?.size || (blob.type && !blob.type.includes("pdf"))) throw new Error("The preview came back empty.");
                return blob;
            } catch (e) {
                throw new Error(await blobErrorMessage(e, "Could not build the contract preview."));
            }
        },
        [contractId, payload, prefix, mode],
    );

    /** Save Review edits (variable → value; "" resets to the CRM value). */
    const saveOverrides = useCallback(
        async (changes: Record<string, string>) => {
            if (!contractId) throw new Error("No contract.");
            const res = await axiosPut(`${prefix}/overrides`, { overrides: changes });
            const overrides = (res?.data?.data?.overrides as Record<string, string>) ?? {};
            setReview((cur) => (cur ? { ...cur, overrides, values: { ...cur.crmValues, ...overrides } } : cur));
        },
        [contractId, prefix],
    );

    /** Save font sizes (key → size; null = back to auto-fit). */
    const saveStyles = useCallback(
        async (changes: Record<string, number | null>) => {
            if (!contractId) throw new Error("No contract.");
            const body = Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, { fontSize: v }]));
            const res = await axiosPut(`${prefix}/overrides`, { styles: body });
            const styles = (res?.data?.data?.styles as Record<string, PearSignFieldStyle>) ?? {};
            setReview((cur) => (cur ? { ...cur, styles } : cur));
        },
        [contractId, prefix],
    );

    const send = useCallback(
        async (extra: { ccEmails?: string[]; message?: string; allowRepeat?: boolean }) => {
            if (!contractId) throw new Error("No contract.");
            setBusy("send");
            try {
                const res = await axiosPost(
                    `${prefix}/send`,
                    mode === "package"
                        ? { message: extra.message, ...(extra.allowRepeat ? { allowRepeat: true } : {}) }
                        : { ...payload(), ...extra },
                );
                const data = res?.data?.data as {
                    state: PearSignState;
                    prefilledFieldCount: number;
                    blankFieldCount: number;
                    emailSent: boolean;
                    invitesFailed?: Array<{ email: string; error: string }>;
                };
                setState(data.state);
                return data;
            } catch (e) {
                // code PEARSIGN_ALREADY_COMPLETED: a signer completed this document in the last 60 days.
                const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
                throw Object.assign(new Error(apiErrorMessage(e, `${signingProviderName()} send failed.`)), { code });
            } finally {
                setBusy(null);
            }
        },
        [contractId, payload, prefix, mode],
    );

    /** Package only: open PearSign's embedded editor with the reviewed values (nothing is sent yet). */
    const openEditor = useCallback(
        async (extra: { message?: string }) => {
            if (!contractId) throw new Error("No contract.");
            setBusy("send");
            try {
                const res = await axiosPost(`${base}/package/editor`, {
                    origin: window.location.origin,
                    message: extra.message,
                });
                return res?.data?.data as { sessionId: string; editorUrl: string; expiresAt: string | null };
            } catch (e) {
                throw new Error(apiErrorMessage(e, `Could not open the ${signingProviderName()} editor.`));
            } finally {
                setBusy(null);
            }
        },
        [base, contractId],
    );

    /**
     * Ask the CRM to record what the editor did. Returns status "sent" once the envelope is saved,
     * "cancelled"/"expired" when the editor closed without sending, or "open" while it is still going.
     */
    const finishEditor = useCallback(
        async (sessionId: string) => {
            if (!contractId) throw new Error("No contract.");
            try {
                const res = await axiosPost(`${base}/package/editor/finish`, { sessionId });
                const data = res?.data?.data as { status: string; state?: PearSignState | null };
                if (data?.status === "sent" && data.state) setState(data.state);
                return data;
            } catch (e) {
                throw new Error(apiErrorMessage(e, `Could not check the ${signingProviderName()} editor.`));
            }
        },
        [base, contractId],
    );

    const sync = useCallback(async () => {
        if (!contractId) return null;
        setBusy("sync");
        try {
            const res = await axiosPost(`/pearsign/contracts/${contractId}/sync`);
            const next = (res?.data?.data?.state as PearSignState | null) ?? null;
            setState(next);
            return next;
        } catch (e) {
            throw new Error(apiErrorMessage(e, `Could not refresh ${signingProviderName()} status.`));
        } finally {
            setBusy(null);
        }
    }, [contractId]);

    /**
     * Void the active envelope. Returns `alreadyEnded` when PearSign had already finished it (the CRM
     * just synced). When PearSign does not know the envelope, throws an error with
     * `code === "PEARSIGN_ENVELOPE_NOT_FOUND"`; call again with `releaseIfMissing` (after the user
     * confirms) to remove it from the CRM so a new contract can be sent.
     */
    const voidEnvelope = useCallback(
        async (opts?: { releaseIfMissing?: boolean }): Promise<{ alreadyEnded?: string } | undefined> => {
            if (!contractId) return;
            setBusy("void");
            try {
                const res = await axiosPost(
                    `/pearsign/contracts/${contractId}/void`,
                    opts?.releaseIfMissing ? { releaseIfMissing: true } : {},
                );
                const data = res?.data?.data as { state?: PearSignState | null; alreadyEnded?: string } | undefined;
                setState(data?.state ?? null);
                return { alreadyEnded: data?.alreadyEnded };
            } catch (e) {
                const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
                throw Object.assign(new Error(apiErrorMessage(e, `Could not void the ${signingProviderName()} envelope.`)), { code });
            } finally {
                setBusy(null);
            }
        },
        [contractId],
    );

    /** Open the sent contract (values as sent, or the signed PDF once completed) in a new tab. */
    const openSentPdf = useCallback(async () => {
        if (!contractId) return;
        const tab = window.open("", "_blank");
        setBusy("download");
        try {
            const res = await axiosGet(`/pearsign/contracts/${contractId}/download`, { responseType: "blob" });
            const url = URL.createObjectURL(res.data as Blob);
            if (tab && !tab.closed) tab.location.href = url;
            else window.open(url, "_blank");
            window.setTimeout(() => URL.revokeObjectURL(url), 30 * 60_000);
        } catch (e) {
            tab?.close();
            throw new Error(await blobErrorMessage(e, `Could not download the ${signingProviderName()} contract.`));
        } finally {
            setBusy(null);
        }
    }, [contractId]);

    /**
     * Save the staged package (contract + addendums + disclosures, CRM values filled in) before it
     * is sent. Changes made later inside the signing service's editor are not in this copy.
     */
    const downloadPackagePdf = useCallback(async () => {
        if (!contractId) throw new Error("Save the contract before downloading it.");
        setBusy("download");
        try {
            const res = await axiosPost(
                `/pearsign/contracts/${contractId}/package/preview`,
                { drawValues: true, download: true },
                { responseType: "blob" },
            );
            const blob = res?.data as Blob;
            if (!blob?.size || (blob.type && !blob.type.includes("pdf"))) throw new Error("The contract came back empty.");
            const disposition = String((res?.headers as Record<string, unknown> | undefined)?.["content-disposition"] ?? "");
            const star = disposition.match(/filename*s*=s*UTF-8''([^;]+)/i);
            let fileName = contractPdfFileName(String(review?.values?.client_legal_name ?? ""));
            if (star?.[1]) {
                try {
                    fileName = decodeURIComponent(star[1].trim());
                } catch {
                    /* keep the default name */
                }
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch (e) {
            throw new Error(await blobErrorMessage(e, "Could not download the contract."));
        } finally {
            setBusy(null);
        }
    }, [contractId, review]);

    return {
        available,
        downloadPackagePdf,
        state,
        review,
        busy,
        error,
        previewOpen,
        isActive: isActivePearSignStatus(state?.status) && Boolean(state?.envelopeId),
        mode,
        openReview,
        openPackageReview,
        refreshReview: fetchReview,
        closePreview,
        fetchPreviewBlob,
        takePrefetchedPreview,
        saveOverrides,
        saveStyles,
        send,
        openEditor,
        finishEditor,
        sync,
        voidEnvelope,
        openSentPdf,
        reloadState: loadState,
    };
}
