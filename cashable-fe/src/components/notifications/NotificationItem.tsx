import { useState } from "react";
import type { Notification } from "@/redux/slices/notificationSlice";
import type { NotificationActions } from "./useNotificationActions";
import NotificationActionsMenu from "./NotificationActionsMenu";
import { formatCurrency, formatDateTimeET } from "@/lib/utils";
import { ChevronDown, Building2 } from "lucide-react";
import {
    bucketMeta,
    categoryMeta,
    importanceMeta,
    isSnoozeDue,
    relativeTime,
    resolveActionUrl,
    snoozeUntilLabel,
} from "./notificationTaxonomy";

interface Props {
    notification: Notification;
    actions: NotificationActions;
    /** Show a selection checkbox (dashboard multi-select). */
    selectable?: boolean;
    selected?: boolean;
    onSelectChange?: (checked: boolean) => void;
    /** Compact paddings for the bell dropdown. */
    compact?: boolean;
}

function senderName(n: Notification): string {
    const actor =
        n.createdBy && typeof n.createdBy === "object"
            ? n.createdBy
            : n.recipient && typeof n.recipient === "object"
              ? n.recipient
              : null;
    if (!actor) return "Unknown";
    return `${actor.firstName || ""} ${actor.lastName || ""}`.trim() || actor.email || "Unknown";
}

/** Pull the populated application object (notifications may carry just an id string). */
function appOf(n: Notification) {
    return n.application && typeof n.application === "object" ? n.application : null;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
    if (value == null || value === "") return null;
    return (
        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 py-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
            <span className="min-w-0 break-words text-xs text-foreground">{value}</span>
        </div>
    );
}

/**
 * One notification row, shared by the bell dropdown and the full dashboard.
 * Surfaces the importance dot, MCA category, title/message, time, an expandable
 * details panel (deal / merchant / amount / stage / sender / documents) and the
 * triage menu.
 */
export default function NotificationItem({
    notification: n,
    actions,
    selectable = false,
    selected = false,
    onSelectChange,
    compact = false,
}: Props) {
    const [expanded, setExpanded] = useState(false);

    const cat = categoryMeta(n.category);
    const CatIcon = cat.icon;
    const imp = importanceMeta(n.importance);
    const bkt = bucketMeta(n.bucket);
    const hasLink = Boolean(resolveActionUrl(n));
    const due = isSnoozeDue(n);

    const sender = senderName(n);
    const title = (n.title || "").replace("Unknown Client", sender) || "Notification";
    const message = (n.message || "").replace("Unknown Client", sender);

    const app = appOf(n);
    const docs = n.documentRequestDetails?.requestedDocuments ?? [];
    const merchant = app?.businessName || app?.ownerName || null;
    const amount =
        app?.loanAmount != null && !Number.isNaN(Number(app.loanAmount))
            ? formatCurrency(Number(app.loanAmount))
            : null;
    const stage = app
        ? [app.currentQueue, app.currentState].filter(Boolean).join(" · ")
        : null;
    const dealRef = app
        ? `#${app.applicationId}${app.dealId ? ` · ${app.dealId}` : ""}`
        : null;
    const hasDetails = Boolean(app || docs.length > 0 || n.createdBy);

    // Every notification: a coloured status badge, the customer and amount in bold.
    const contractUpdate = notificationView(n.type, title, message, merchant, amount, cat.label);

    return (
        <div
            className="group border-b border-border/60 last:border-b-0 transition-colors bg-background"
        >
            <div
                className={`flex items-start gap-3 ${compact ? "px-3 py-2.5" : "px-4 py-3"} ${
                    hasLink ? "cursor-pointer" : ""
                } hover:bg-muted/40`}
                onClick={() => hasLink && actions.open(n)}
            >
                {selectable && (
                    <input
                        type="checkbox"
                        checked={selected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onSelectChange?.(e.target.checked)}
                        aria-label="Select notification"
                        className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand)]"
                    />
                )}

                {/* Importance dot + category icon */}
                <div className="mt-0.5 flex shrink-0 flex-col items-center gap-1.5">
                    <span
                        className={`h-2.5 w-2.5 rounded-full ${imp.dot}`}
                        title={`${imp.label} priority`}
                        aria-label={`${imp.label} priority`}
                    />
                    <CatIcon className={`h-4 w-4 ${cat.tone}`} aria-hidden />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <p
                            className={`text-sm ${!n.isRead ? "font-semibold" : "font-medium"} ${
                                contractUpdate ? contractUpdate.tone.text : "text-foreground"
                            }`}
                        >
                            {contractUpdate ? (
                                <span className={`mr-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${contractUpdate.tone.badge}`}>
                                    {contractUpdate.status}
                                </span>
                            ) : null}
                            {title}
                        </p>
                        <div className="flex shrink-0 items-center gap-1">
                            {!n.isRead && <span className="h-2 w-2 rounded-full bg-[image:var(--brand-gradient)]" aria-label="Unread" />}
                            <div className="opacity-60 transition-opacity group-hover:opacity-100">
                                <NotificationActionsMenu notification={n} actions={actions} />
                            </div>
                        </div>
                    </div>

                    {contractUpdate?.customer ? (
                        <p className="mt-0.5 text-sm text-foreground">
                            <span className="font-bold">{contractUpdate.customer}</span>
                            {contractUpdate.amount ? (
                                <>
                                    {" — "}
                                    <span className="font-bold">{contractUpdate.amount}</span>
                                </>
                            ) : null}
                        </p>
                    ) : null}
                    {(contractUpdate ? contractUpdate.rest : message) && (
                        <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground" title={message}>
                            {contractUpdate ? contractUpdate.rest : message}
                        </p>
                    )}

                    {/* Quick context line: deal + merchant when present */}
                    {(dealRef || (merchant && !contractUpdate?.customer)) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-foreground/70">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            {dealRef && <span className="font-medium">Deal {dealRef}</span>}
                            {merchant && !contractUpdate?.customer && (
                                <>
                                    {dealRef && <span aria-hidden>·</span>}
                                    <span className="truncate">{merchant}</span>
                                </>
                            )}
                            {amount && !contractUpdate?.amount && (
                                <>
                                    <span aria-hidden>·</span>
                                    <span className="font-medium">{amount}</span>
                                </>
                            )}
                        </div>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className={`inline-flex items-center gap-1 ${cat.tone}`}>{cat.label}</span>
                        <span aria-hidden>·</span>
                        <span className="tabular-nums text-foreground/70">{formatDateTimeET(n.createdAt)} ET</span>
                        <span aria-hidden>·</span>
                        <span>{relativeTime(n.createdAt)}</span>
                        {n.importance && n.importance !== "normal" && (
                            <span className={`rounded px-1.5 py-0.5 ${imp.chip}`}>{imp.label}</span>
                        )}
                        {n.bucket && n.bucket !== "inbox" && (
                            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-foreground/70">
                                <bkt.icon className="h-3 w-3" />
                                {bkt.label}
                                {n.bucket === "snoozed" && n.snoozedUntil && (
                                    <span className={due ? "text-amber-600 dark:text-amber-400" : ""}>
                                        {due ? "· due" : `· ${snoozeUntilLabel(n.snoozedUntil)}`}
                                    </span>
                                )}
                            </span>
                        )}
                        {hasDetails && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setExpanded((v) => !v);
                                }}
                                aria-expanded={expanded}
                                className="inline-flex cursor-pointer items-center gap-0.5 text-[var(--brand)] hover:underline"
                            >
                                {expanded ? "Hide details" : "Details"}
                                <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Expanded detail panel */}
            {expanded && hasDetails && (
                <div className={`${compact ? "px-3" : "px-4"} pb-3 pl-11`}>
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                        {app && (
                            <>
                                <DetailRow label="Deal" value={dealRef ? `Deal ${dealRef}` : null} />
                                <DetailRow label="Merchant" value={merchant} />
                                <DetailRow label="Amount" value={amount} />
                                <DetailRow label="Stage" value={stage} />
                                {app.priority && <DetailRow label="Priority" value={app.priority} />}
                            </>
                        )}
                        <DetailRow label="From" value={n.createdBy ? sender : null} />
                        {docs.length > 0 && <DetailRow label="Requested" value={docs.join(", ")} />}
                        {n.documentRequestDetails?.requestAdditional && (
                            <DetailRow label="Note" value="Additional documents may be required" />
                        )}
                        <DetailRow label="Received" value={formatDateTimeET(n.createdAt)} />
                        {hasLink && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    actions.open(n);
                                }}
                                className="mt-2 cursor-pointer text-xs font-medium text-[var(--brand)] hover:underline"
                            >
                                Open deal →
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

const STATUS_TONES = {
    done: { text: "text-emerald-700 dark:text-emerald-400", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800" },
    info: { text: "text-sky-700 dark:text-sky-400", badge: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800" },
    waiting: { text: "text-amber-700 dark:text-amber-400", badge: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800" },
    ended: { text: "text-rose-700 dark:text-rose-400", badge: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800" },
    neutral: { text: "text-foreground", badge: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700" },
} as const;

/** Status from the title, first match wins (red, then green, blue, amber). */
const STATUS_RULES: Array<[RegExp, string, keyof typeof STATUS_TONES]> = [
    [/sent (a |the )?(deal |application )?back|returned|correction/, "Sent back", "ended"],
    [/declin/, "Declined", "ended"],
    [/void|revok/, "Voided", "ended"],
    [/reject/, "Rejected", "ended"],
    [/expire/, "Expired", "ended"],
    [/delet|remov/, "Deleted", "ended"],
    [/cancel/, "Cancelled", "ended"],
    [/fail|error|bounc|nsf/, "Failed", "ended"],
    [/overdue|missed/, "Overdue", "ended"],
    [/completed/, "Completed", "done"],
    [/signed/, "Signed", "done"],
    [/approved/, "Approved", "done"],
    [/funded|disburs|released/, "Funded", "done"],
    [/received|uploaded/, "Received", "done"],
    [/paid|cleared|collected/, "Paid", "done"],
    [/viewed|opened/, "Viewed", "info"],
    [/assign|sent .*to you|to you/, "Assigned", "info"],
    [/\bnew\b|created|added/, "New", "info"],
    [/recommend|request|approval|review/, "Review", "waiting"],
    [/remind|follow/, "Follow-up", "waiting"],
    [/pending|awaiting|waiting/, "Pending", "waiting"],
    [/\bsent\b/, "Sent", "waiting"],
];

/**
 * How a notification reads: a status badge and colour (from the title), and the customer / amount
 * shown in bold. Contract updates carry them in the message ("<Customer> — <$amount> · …");
 * others use the deal's name and the first amount in the text (else the deal's amount).
 */
function notificationView(
    type: unknown,
    title: string,
    message: string,
    dealName: string | null,
    dealAmount: string | null,
    categoryLabel: string,
) {
    const t = title.toLowerCase();
    const rule = STATUS_RULES.find(([re]) => re.test(t));
    const status = rule ? rule[1] : categoryLabel || "Update";
    const tone = STATUS_TONES[rule ? rule[2] : "neutral"];
    const m = /^(.+?) — (\$[\d,]+(?:\.\d{2})?) · (.*)$/.exec(message);
    if (m && String(type ?? "") === "contract_signing") {
        return { status, tone, customer: m[1], amount: m[2], rest: m[3] };
    }
    const inText = /\$\s?[\d,]+(?:\.\d{2})?/.exec(`${title} ${message}`)?.[0]?.replace(/\s/g, "") ?? null;
    return { status, tone, customer: dealName, amount: inText ?? dealAmount, rest: message };
}

/** Status label and colours of a notification (from its title), for the merchant timeline. */
export function notificationStatusTone(title: string): {
    status: string;
    text: string;
    badge: string;
} {
    const rule = STATUS_RULES.find(([re]) => re.test(String(title ?? "").toLowerCase()));
    const tone = STATUS_TONES[rule ? rule[2] : "neutral"];
    return { status: rule ? rule[1] : "Update", text: tone.text, badge: tone.badge };
}
