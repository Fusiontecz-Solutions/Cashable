import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { AlertTriangle, Check, CheckCircle2, Eye, ExternalLink, Loader2, RefreshCw, RotateCcw, Search, Send, Users, ZoomIn, ZoomOut } from "lucide-react";
import { Document, Page } from "react-pdf";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PearSignController, PearSignFieldBox, PearSignReview } from "./usePearSignContract";

/**
 * PearSign Review — the filled main contract, inside the CRM, before anything is sent
 * (same experience as Meridian's PearSignPreviewModal).
 *
 * Left: the agreement PDF (signer boxes drawn by the server); every CRM value is drawn
 * on top in the browser at its PearSign field position, so an edit shows as you type.
 * Right: every CRM-filled value, editable. Edits save to the contract automatically
 * (PearSign Review overrides) and are applied when the envelope is sent.
 * "Review done — Send via PearSign" closes the review and opens the send confirmation.
 */

const AUTOSAVE_MS = 900;

type SaveState = "idle" | "saving" | "saved" | "error";

// ---------- PDF pages ----------

const ZOOM_STEPS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];
/** Same look as the server-drawn values (pearsign-preview.service.ts). */
const VALUE_COLOR = "#0d1f73";
const VALUE_FONT = "Helvetica, Arial, sans-serif";
const MAX_PT = 10;
const MIN_PT = 5.5;
const PAD_PT = 2;

let measureCtx: CanvasRenderingContext2D | null = null;
function textWidthPt(text: string, sizePt: number): number {
    if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
    if (!measureCtx) return text.length * sizePt * 0.5;
    measureCtx.font = `${sizePt}px ${VALUE_FONT}`;
    return measureCtx.measureText(text).width;
}

function fitText(text: string, box: PearSignFieldBox): { size: number; wrap: boolean } {
    const width = Math.max(4, box.width - PAD_PT * 2);
    const start = Math.min(MAX_PT, Math.max(MIN_PT, box.height * 0.7));
    for (let s = start; s >= MIN_PT; s -= 0.5) if (textWidthPt(text, s) <= width) return { size: s, wrap: false };
    return { size: MIN_PT, wrap: true };
}

function PdfPages({
    url,
    boxes,
    values,
    activeKey,
    activeFromPdf,
    editable,
    editValue,
    onSelect,
    onEdit,
}: {
    url: string | null;
    boxes: PearSignFieldBox[];
    values: Record<string, string>;
    activeKey: string | null;
    /** Selection came from a click on the document — it is already in view, don't scroll. */
    activeFromPdf: boolean;
    editable: boolean;
    /** Raw input value for the active field (same as the sidebar input). */
    editValue: string;
    onSelect: (key: string) => void;
    onEdit: (key: string, value: string) => void;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [numPages, setNumPages] = useState(0);
    const [pageWidthPt, setPageWidthPt] = useState<Record<number, number>>({});
    const [page, setPage] = useState(1);
    /** The one box instance being edited inline (a key can appear on several pages). */
    const [editingBox, setEditingBox] = useState<string | null>(null);

    useEffect(() => {
        setNumPages(0);
        setPageWidthPt({});
        setPage(1);
        setEditingBox(null);
    }, [url]);

    // Selection moved elsewhere (sidebar) → close the inline editor.
    useEffect(() => {
        setEditingBox((cur) => (cur && activeKey && cur.startsWith(`${activeKey}|`) ? cur : null));
    }, [activeKey]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth - 48)));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const pageWidth = Math.round(Math.min(width * zoom, 2400));

    const byPage = useMemo(() => {
        const m = new Map<number, PearSignFieldBox[]>();
        for (const b of boxes) m.set(b.page, [...(m.get(b.page) ?? []), b]);
        return m;
    }, [boxes]);

    useEffect(() => {
        if (!activeKey || activeFromPdf) return;
        const el = scrollRef.current?.querySelector<HTMLElement>(`[data-box="${CSS.escape(activeKey)}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }, [activeKey, activeFromPdf, numPages]);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const mid = el.scrollTop + el.clientHeight / 3;
        let current = 1;
        el.querySelectorAll<HTMLElement>("[data-page]").forEach((p) => {
            if (p.offsetTop <= mid) current = Number(p.dataset.page);
        });
        setPage(current);
    };

    const zoomIdx = ZOOM_STEPS.indexOf(zoom);

    return (
        <>
            <div className="flex h-10 shrink-0 items-center justify-center gap-2 border-b border-slate-300 bg-white/90 px-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300">
                <span className="tabular-nums">{numPages ? `Page ${page} of ${numPages}` : "Loading…"}</span>
                <span className="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-700" />
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={zoomIdx <= 0} onClick={() => setZoom(ZOOM_STEPS[zoomIdx - 1])} aria-label="Zoom out">
                    <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={zoomIdx >= ZOOM_STEPS.length - 1}
                    onClick={() => setZoom(ZOOM_STEPS[zoomIdx + 1])}
                    aria-label="Zoom in"
                >
                    <ZoomIn className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={zoom === 1} onClick={() => setZoom(1)}>
                    Fit width
                </Button>
            </div>
            <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-auto">
                {url && width > 0 ? (
                    <Document
                        file={url}
                        loading={
                            <div className="flex h-60 items-center justify-center gap-2 text-xs text-slate-500">
                                <Loader2 className="h-4 w-4 animate-spin" /> Loading contract…
                            </div>
                        }
                        error={<div className="p-6 text-center text-xs text-rose-700">Could not display the PDF.</div>}
                        onLoadSuccess={(pdf: { numPages: number }) => setNumPages(pdf.numPages)}
                    >
                        <div className="flex flex-col items-center gap-4 px-6 py-5">
                            {Array.from({ length: numPages }, (_, i) => {
                                const n = i + 1;
                                const scale = pageWidthPt[n] ? pageWidth / pageWidthPt[n] : 0;
                                return (
                                    <div key={n} data-page={n} className="relative bg-white shadow-md ring-1 ring-black/5">
                                        <Page
                                            pageNumber={n}
                                            width={pageWidth}
                                            renderTextLayer={false}
                                            renderAnnotationLayer={false}
                                            loading={<div style={{ width: pageWidth, height: Math.round(pageWidth * 1.294) }} />}
                                            onLoadSuccess={(p: { originalWidth: number }) =>
                                                setPageWidthPt((cur) => (cur[n] === p.originalWidth ? cur : { ...cur, [n]: p.originalWidth }))
                                            }
                                        />
                                        {scale
                                            ? (byPage.get(n) ?? []).map((b, j) => {
                                                  const text = String(values[b.key] ?? "").trim();
                                                  const active = b.key === activeKey;
                                                  const boxId = `${b.key}|${n}|${j}`;
                                                  const editing = editable && editingBox === boxId;
                                                  const fit = text ? fitText(text, b) : { size: MAX_PT, wrap: false };
                                                  const style = {
                                                      left: b.x * scale,
                                                      top: b.y * scale,
                                                      width: b.width * scale,
                                                      minHeight: b.height * scale,
                                                      paddingLeft: PAD_PT * scale,
                                                      fontFamily: VALUE_FONT,
                                                      fontSize: fit.size * scale,
                                                      lineHeight: 1.1,
                                                      color: VALUE_COLOR,
                                                  } as const;
                                                  if (editing) {
                                                      return (
                                                          <input
                                                              key={`${b.key}-${j}`}
                                                              data-box={b.key}
                                                              autoFocus
                                                              autoComplete="off"
                                                              value={editValue}
                                                              placeholder="Type a value"
                                                              onChange={(e) => onEdit(b.key, e.target.value)}
                                                              onBlur={() => setEditingBox((cur) => (cur === boxId ? null : cur))}
                                                              onKeyDown={(e) => {
                                                                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                                              }}
                                                              className="absolute z-20 rounded-sm bg-white outline-none ring-2 ring-[var(--brand)] shadow-md"
                                                              style={{
                                                                  ...style,
                                                                  height: Math.max(b.height * scale, (MAX_PT + 4) * scale),
                                                                  minWidth: 120,
                                                                  fontSize: Math.max(fit.size, 8) * scale,
                                                              }}
                                                          />
                                                      );
                                                  }
                                                  return (
                                                      <div
                                                          key={`${b.key}-${j}`}
                                                          data-box={b.key}
                                                          role="button"
                                                          tabIndex={-1}
                                                          title={editable ? "Click to edit" : undefined}
                                                          onClick={() => {
                                                              onSelect(b.key);
                                                              if (editable) setEditingBox(boxId);
                                                          }}
                                                          className={`absolute flex cursor-pointer items-center rounded-sm transition-colors ${
                                                              active
                                                                  ? "bg-amber-200/60 ring-2 ring-amber-400"
                                                                  : text
                                                                    ? "hover:bg-sky-100/70 hover:ring-1 hover:ring-sky-400"
                                                                    : "outline-dashed outline-1 outline-sky-300/70 hover:bg-sky-100/70"
                                                          }`}
                                                          style={{
                                                              ...style,
                                                              whiteSpace: fit.wrap ? "normal" : "pre",
                                                              overflowWrap: "anywhere",
                                                          }}
                                                      >
                                                          {text}
                                                      </div>
                                                  );
                                              })
                                            : null}
                                    </div>
                                );
                            })}
                        </div>
                    </Document>
                ) : null}
            </div>
        </>
    );
}

// ---------- Review modal ----------

export function PearSignReviewModal({ ctl, onDone }: { ctl: PearSignController; onDone: () => void }) {
    const open = ctl.previewOpen;
    const review = ctl.review;
    const ctlRef = useRef(ctl);
    ctlRef.current = ctl;

    const [draft, setDraft] = useState<Record<string, string>>({});
    const draftRef = useRef(draft);
    draftRef.current = draft;
    const dirtyRef = useRef(new Set<string>());
    const timerRef = useRef<number | null>(null);
    const chainRef = useRef<Promise<void>>(Promise.resolve());
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const [filter, setFilter] = useState("");
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const [activeFromPdf, setActiveFromPdf] = useState(false);
    const sidebarRef = useRef<HTMLDivElement>(null);

    /** Field clicked on the document → select it and bring its sidebar input into view. */
    const selectFromPdf = useCallback((key: string) => {
        setActiveFromPdf(true);
        setActiveKey(key);
    }, []);

    useEffect(() => {
        if (!activeKey || !activeFromPdf) return;
        const sel = `[data-field="${CSS.escape(activeKey)}"]`;
        const el = sidebarRef.current?.querySelector<HTMLElement>(sel);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
        // Hidden by the search filter — clear it, then scroll once the list re-renders.
        setFilter("");
        const t = window.setTimeout(
            () => sidebarRef.current?.querySelector<HTMLElement>(sel)?.scrollIntoView({ behavior: "smooth", block: "center" }),
            50,
        );
        return () => window.clearTimeout(t);
    }, [activeKey, activeFromPdf]);

    /** Save every dirty field (queued so saves never overlap). */
    const flush = useCallback((): Promise<void> => {
        if (timerRef.current) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        chainRef.current = chainRef.current.then(async () => {
            const keys = [...dirtyRef.current];
            if (!keys.length) {
                setSaveState((st) => (st === "saving" ? "saved" : st));
                return;
            }
            const changes: Record<string, string> = {};
            for (const k of keys) {
                changes[k] = draftRef.current[k] ?? "";
                dirtyRef.current.delete(k);
            }
            setSaveState("saving");
            try {
                await ctlRef.current.saveOverrides(changes);
                setSaveState(dirtyRef.current.size ? "saving" : "saved");
            } catch (e) {
                for (const k of keys) dirtyRef.current.add(k);
                setSaveState("error");
                const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                toast.error(msg || (e instanceof Error ? e.message : "Could not save the change."));
            }
        });
        return chainRef.current;
    }, []);

    const change = useCallback(
        (key: string, value: string) => {
            setDraft((prev) => ({ ...prev, [key]: value }));
            dirtyRef.current.add(key);
            setSaveState("saving");
            if (timerRef.current) window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => void flush(), AUTOSAVE_MS);
        },
        [flush],
    );

    /** Edits applied over saved values: what the contract shows right now. */
    const live = useMemo(() => {
        if (!review) return {} as Record<string, string>;
        const out: Record<string, string> = { ...review.crmValues, ...review.overrides };
        for (const [k, v] of Object.entries(draft)) {
            if (String(v).trim()) out[k] = v;
            else out[k] = review.crmValues[k] ?? "";
        }
        return out;
    }, [review, draft]);

    // ---------- PDF ----------
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfError, setPdfError] = useState<string | null>(null);
    const [building, setBuilding] = useState(false);
    const requestRef = useRef(0);
    const urlRef = useRef<string | null>(null);

    /** Agreement with the signer boxes only — values are drawn live on top. */
    const rebuild = useCallback(async () => {
        const id = ++requestRef.current;
        setBuilding(true);
        try {
            // First build after open: use the PDF the controller already started fetching.
            const prefetched = ctlRef.current.takePrefetchedPreview();
            let blob: Blob;
            try {
                blob = prefetched ? await prefetched : await ctlRef.current.fetchPreviewBlob({ drawValues: false });
            } catch (e) {
                if (!prefetched) throw e;
                blob = await ctlRef.current.fetchPreviewBlob({ drawValues: false });
            }
            if (id !== requestRef.current) return;
            const url = URL.createObjectURL(blob);
            const old = urlRef.current;
            if (old) window.setTimeout(() => URL.revokeObjectURL(old), 60_000);
            urlRef.current = url;
            setPdfUrl(url);
            setPdfError(null);
        } catch (e) {
            if (id !== requestRef.current) return;
            setPdfError(e instanceof Error ? e.message : "Could not build the contract preview.");
        } finally {
            if (id === requestRef.current) setBuilding(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        void rebuild();
    }, [open, rebuild]);

    /** The server-filled PDF (exactly what PearSign gets) in a new tab. */
    const openFilledInNewTab = useCallback(async () => {
        const tab = window.open("", "_blank");
        if (!tab) {
            toast.error("The browser blocked the new tab. Allow pop-ups for this site and try again.");
            return;
        }
        tab.document.title = "Contract — PearSign preview";
        tab.document.body.innerHTML =
            '<div style="font:14px system-ui,sans-serif;color:#475569;display:flex;height:100vh;align-items:center;justify-content:center">Building the filled contract…</div>';
        try {
            await flush();
            const blob = await ctlRef.current.fetchPreviewBlob({ drawValues: true, values: live });
            if (tab.closed) return;
            const url = URL.createObjectURL(blob);
            tab.location.href = url;
            window.setTimeout(() => URL.revokeObjectURL(url), 30 * 60_000);
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Could not build the contract preview.";
            if (!tab.closed) {
                tab.document.body.innerHTML = '<div style="font:14px system-ui,sans-serif;color:#b91c1c;padding:24px"></div>';
                (tab.document.body.firstChild as HTMLElement).textContent = msg;
            }
            toast.error(msg);
        }
    }, [flush, live]);

    // Reset when the modal closes.
    useEffect(() => {
        if (open) return;
        requestRef.current++;
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = null;
        dirtyRef.current.clear();
        setDraft({});
        setSaveState("idle");
        setFilter("");
        setActiveKey(null);
        setActiveFromPdf(false);
        setPdfError(null);
        setBuilding(false);
        setPdfUrl(null);
        if (urlRef.current) {
            const u = urlRef.current;
            urlRef.current = null;
            window.setTimeout(() => URL.revokeObjectURL(u), 60_000);
        }
    }, [open]);

    // ---------- actions ----------
    const [finishing, setFinishing] = useState(false);

    const close = useCallback(async () => {
        if (finishing) return;
        setFinishing(true);
        try {
            await flush();
            if (dirtyRef.current.size && !window.confirm("Some changes could not be saved. Close the review anyway?")) return;
            ctlRef.current.closePreview();
        } finally {
            setFinishing(false);
        }
    }, [finishing, flush]);

    const done = useCallback(async () => {
        if (finishing) return;
        setFinishing(true);
        try {
            await flush();
            if (dirtyRef.current.size) {
                toast.error("Some changes could not be saved. Fix them before sending.");
                return;
            }
            ctlRef.current.closePreview();
            onDone();
        } finally {
            setFinishing(false);
        }
    }, [finishing, flush, onDone]);

    if (!review) return null;

    // ---------- render ----------
    const q = filter.trim().toLowerCase();
    const emptyCount = review.fields.filter((f) => !String(live[f.key] ?? "").trim()).length;
    const byFirstPage = new Map<number, PearSignReview["fields"]>();
    for (const f of review.fields) {
        if (q && !`${f.label} ${f.key}`.toLowerCase().includes(q)) continue;
        const p = Math.min(...f.pages);
        byFirstPage.set(p, [...(byFirstPage.get(p) ?? []), f]);
    }
    const saveBadge =
        saveState === "saving" ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving to CRM…
            </span>
        ) : saveState === "saved" ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                <Check className="h-3 w-3" /> Changes saved to CRM
            </span>
        ) : saveState === "error" ? (
            <button type="button" className="inline-flex items-center gap-1 text-[11px] text-rose-700 hover:underline" onClick={() => void flush()}>
                <AlertTriangle className="h-3 w-3" /> Save failed — retry
            </button>
        ) : (
            <span className="text-[11px] text-slate-400">Edits save to the CRM automatically</span>
        );

    return (
        <Dialog open={open} onOpenChange={(o: boolean) => (!o ? void close() : undefined)}>
            <DialogContent
                showCloseButton={false}
                onEscapeKeyDown={(e: { preventDefault: () => void }) => {
                    e.preventDefault();
                    void close();
                }}
                onPointerDownOutside={(e: { preventDefault: () => void }) => e.preventDefault()}
                onInteractOutside={(e: { preventDefault: () => void }) => e.preventDefault()}
                className="flex h-[min(96vh,calc(100dvh-1rem))] w-[min(1700px,97vw)] max-w-[97vw] flex-col gap-0 overflow-hidden bg-white p-0 dark:bg-slate-900 dark:text-slate-100 sm:max-w-[97vw]"
            >
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]">
                            <Eye className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <DialogTitle className="truncate text-sm font-semibold">
                                {ctl.mode === "package" ? "Review package" : "Review contract"} — {review.funderName || "Funder"} ({review.ownerCount >= 2 ? "2 owners" : "1 owner"})
                            </DialogTitle>
                            {ctl.mode === "package" && review.templateName ? (
                                <p className="truncate text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                    {review.templateName} — contract, addendums and disclosure in one envelope
                                </p>
                            ) : null}
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Not sent yet. Values come from the CRM; correct any value on the right — it is saved to the contract and shown on the document.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => void openFilledInNewTab()}>
                            <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open in new tab
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={building} onClick={() => void rebuild()}>
                            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${building ? "animate-spin" : ""}`} /> Refresh
                        </Button>
                    </div>
                </div>

                {review.blockers.length || review.warnings.length ? (
                    <div className="space-y-1 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        {[...review.blockers, ...review.warnings].map((m) => (
                            <div key={m} className="flex items-start gap-1.5">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {m}
                            </div>
                        ))}
                    </div>
                ) : null}

                {/* Body */}
                <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                    <div className="relative flex min-h-[40vh] min-w-0 flex-1 flex-col bg-slate-200 dark:bg-slate-800">
                        <PdfPages
                            url={pdfUrl}
                            boxes={review.fieldLayout}
                            values={live}
                            activeKey={activeKey}
                            activeFromPdf={activeFromPdf}
                            editable={!ctl.isActive}
                            editValue={activeKey ? (activeKey in draft ? draft[activeKey] : live[activeKey] ?? "") : ""}
                            onSelect={selectFromPdf}
                            onEdit={change}
                        />
                        {pdfError && !pdfUrl ? (
                            <div className="absolute inset-0 flex items-center justify-center p-6">
                                <div className="max-w-md rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
                                    <div className="mb-1 flex items-center gap-1.5 font-semibold">
                                        <AlertTriangle className="h-4 w-4" /> Preview could not be built
                                    </div>
                                    {pdfError}
                                    <div className="mt-2">
                                        <Button type="button" size="sm" variant="outline" className="h-7 bg-white text-xs" onClick={() => void rebuild()}>
                                            Try again
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        {building ? (
                            <div className="absolute right-3 top-12 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[11px] text-slate-700 shadow">
                                <Loader2 className="h-3 w-3 animate-spin" /> {pdfUrl ? "Updating…" : "Loading contract…"}
                            </div>
                        ) : null}
                    </div>

                    <aside className="flex min-h-0 w-full flex-col border-t border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-950/40 lg:w-[420px] lg:border-l lg:border-t-0">
                        <div className="space-y-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-700">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Contract values</span>
                                {saveBadge}
                            </div>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                                <Input autoComplete="off" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a field…" className="h-8 pl-8 text-xs" />
                            </div>
                            {emptyCount ? (
                                <p className="text-[11px] text-amber-700 dark:text-amber-300">{emptyCount} field(s) are blank and will print empty.</p>
                            ) : null}
                        </div>
                        <div ref={sidebarRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
                            {[...byFirstPage.entries()]
                                .sort((a, b) => a[0] - b[0])
                                .map(([pageNo, list]) => (
                                    <section key={pageNo} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                                        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--brand)] dark:text-[var(--brand-accent)]">
                                            Page {pageNo}
                                        </h4>
                                        <div className="grid grid-cols-1 gap-2">
                                            {list.map((f) => {
                                                const edited = f.key in draft ? String(draft[f.key]).trim() !== "" : f.key in review.overrides;
                                                const value = f.key in draft ? draft[f.key] : live[f.key] ?? "";
                                                const crm = review.crmValues[f.key] ?? "";
                                                const isActive = f.key === activeKey;
                                                return (
                                                    <label
                                                        key={f.key}
                                                        data-field={f.key}
                                                        className={`flex min-w-0 flex-col gap-1 rounded-md transition-colors ${
                                                            isActive ? "-mx-1.5 bg-amber-50 px-1.5 py-1 ring-2 ring-amber-400 dark:bg-amber-950/30" : ""
                                                        }`}
                                                    >
                                                        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                                                            {f.label}
                                                            <span className="font-normal text-slate-400">
                                                                · {f.key}
                                                                {f.pages.length > 1 ? ` · pages ${f.pages.join(", ")}` : ""}
                                                            </span>
                                                            {!String(live[f.key] ?? "").trim() ? (
                                                                <span className="rounded bg-amber-100 px-1 text-[9px] font-semibold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                                                    blank
                                                                </span>
                                                            ) : edited ? (
                                                                <span className="rounded bg-sky-100 px-1 text-[9px] font-semibold uppercase text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                                                                    edited
                                                                </span>
                                                            ) : null}
                                                        </span>
                                                        <Input
                                                            type="text"
                                                            value={value}
                                                            placeholder={crm || "Not set in CRM"}
                                                            autoComplete="off"
                                                            onFocus={() => {
                                                                setActiveFromPdf(false);
                                                                setActiveKey(f.key);
                                                            }}
                                                            disabled={ctl.isActive}
                                                            onChange={(e) => change(f.key, e.target.value)}
                                                            className="h-8 text-xs"
                                                        />
                                                        {edited ? (
                                                            <span className="flex items-center gap-1 text-[10px] text-sky-700 dark:text-sky-300">
                                                                CRM value: {crm || "(blank)"}
                                                                <button
                                                                    type="button"
                                                                    className="inline-flex items-center gap-0.5 font-medium text-[var(--brand)] hover:underline"
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        change(f.key, "");
                                                                    }}
                                                                >
                                                                    <RotateCcw className="h-2.5 w-2.5" /> Use CRM value
                                                                </button>
                                                            </span>
                                                        ) : null}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </section>
                                ))}
                        </div>
                    </aside>
                </div>

                {/* Footer */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-2.5 dark:border-slate-700">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Yellow boxes are where each owner signs or initials in PearSign; blue boxes are completed by the signer. Final fonts may differ slightly.
                    </span>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" onClick={() => void close()} disabled={finishing}>
                            Close
                        </Button>
                        <Button
                            type="button"
                            className="bg-[var(--brand)] text-white hover:opacity-90"
                            onClick={() => void done()}
                            disabled={finishing || !!ctl.busy || ctl.isActive || review.blockers.length > 0}
                            title={
                                review.blockers.length
                                    ? review.blockers[0]
                                    : ctl.isActive
                                      ? "An envelope is already out for signature"
                                      : "Close the review and send via PearSign"
                            }
                        >
                            {finishing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                            Review done — Send via PearSign
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ---------- Send confirmation ----------

export function PearSignSendDialog({
    ctl,
    open,
    ccEmails,
    onCancel,
    onConfirm,
    onBackToReview,
}: {
    ctl: PearSignController;
    open: boolean;
    ccEmails: string[];
    onCancel: () => void;
    onConfirm: () => void;
    onBackToReview: () => void;
}) {
    const review = ctl.review;
    const sending = ctl.busy === "send";
    const filled = review ? review.fields.filter((f) => String(review.values[f.key] ?? "").trim()).length : 0;
    const blank = review ? review.fields.length - filled : 0;
    return (
        <Dialog open={open && !!review} onOpenChange={(o: boolean) => (!o && !sending ? onCancel() : undefined)}>
            <DialogContent
                className="sm:max-w-lg dark:bg-slate-900 dark:text-slate-100"
                onPointerDownOutside={(e: { preventDefault: () => void }) => sending && e.preventDefault()}
            >
                <div className="space-y-4 py-2">
                    <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]">
                            <Send className="h-4 w-4" />
                        </div>
                        <div>
                            <DialogTitle className="text-base font-semibold">Send via PearSign</DialogTitle>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                PearSign emails the {review?.funderName || "funder"} {ctl.mode === "package" ? "contract package" : "agreement"} to each owner in this order.
                            </p>
                        </div>
                    </div>

                    {review ? (
                        <>
                            <ol className="space-y-2">
                                {review.recipients.map((r, i) => (
                                    <li key={r.roleId} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                            {i + 1}
                                        </span>
                                        <div className="min-w-0">
                                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{r.roleName}</div>
                                            <div className="truncate text-sm font-semibold">{r.name || "—"}</div>
                                            <div className="truncate text-xs text-slate-500">{r.email}</div>
                                        </div>
                                    </li>
                                ))}
                            </ol>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                                    <div className="text-lg font-semibold">{filled}</div>
                                    values prefilled
                                </div>
                                <div
                                    className={`rounded-lg px-3 py-2 ${
                                        blank
                                            ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                                            : "bg-slate-50 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300"
                                    }`}
                                >
                                    <div className="text-lg font-semibold">{blank}</div>
                                    {blank ? "values will print blank" : "blank values"}
                                </div>
                            </div>

                            {ccEmails.length ? (
                                <p className="flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                                    <Users className="mt-0.5 h-3 w-3 shrink-0" />
                                    CC ({ccEmails.join(", ")}) is recorded on the contract — PearSign does not email CC copies.
                                </p>
                            ) : null}
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {ctl.mode === "package"
                                    ? "One envelope: the contract with the selected addendums and state disclosure, in the order shown in the review."
                                    : "Addendums, ACH and state disclosures are not part of this envelope — send them with PearSign as before."}
                            </p>
                        </>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <Button type="button" variant="ghost" size="sm" className="text-xs" disabled={sending} onClick={onBackToReview}>
                            <Eye className="mr-1 h-3.5 w-3.5" /> Back to review
                        </Button>
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" disabled={sending} onClick={onCancel}>
                                Cancel
                            </Button>
                            <Button type="button" className="bg-[var(--brand)] text-white hover:opacity-90" disabled={sending} onClick={onConfirm}>
                                {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                                {sending ? "Sending…" : "Send via PearSign"}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
