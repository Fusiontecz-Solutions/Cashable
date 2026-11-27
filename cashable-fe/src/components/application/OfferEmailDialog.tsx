import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Send } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { axiosGet, axiosPost } from "@/redux/axios";
import {
    buildOfferEmailBody,
    buildOfferEmailHtml,
    num,
    OFFER_EMAIL_DEFAULT_CC,
    OFFER_EMAIL_DEFAULT_TO,
    str,
} from "./offerEmailTemplate";
import { extractMonthlyRevenuesFromBankAnalyses } from "./contractdata/disclosureAprCalculator";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    applicationId: string;
    application: Record<string, unknown> | null | undefined;
    offerDecision: Record<string, unknown> | null | undefined;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const splitEmails = (v: string) => v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);

export default function OfferEmailDialog({
    open,
    onOpenChange,
    applicationId,
    application,
    offerDecision,
}: Props) {
    const [to, setTo] = useState("");
    const [cc, setCc] = useState("");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [loadingRevenue, setLoadingRevenue] = useState(false);
    const [sending, setSending] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    const businessName = useMemo(() => {
        const client = ((application ?? {}).client as Record<string, unknown> | null) ?? {};
        const business = (client.business as Record<string, unknown> | null) ?? {};
        return str(client.businessName) || str(business.name) || str(business.legalName);
    }, [application]);

    // Fill the form each time the dialog opens: saved recipients + the deal's details.
    useEffect(() => {
        if (!open) return;
        setTo(OFFER_EMAIL_DEFAULT_TO.join(", "));
        setCc(OFFER_EMAIL_DEFAULT_CC.join(", "));
        setSubject(`OFFER - ${businessName}`.trim().replace(/ -$/, ""));
        const client = ((application ?? {}).client as Record<string, unknown> | null) ?? {};
        const business = (client.business as Record<string, unknown> | null) ?? {};
        const fallbackRevenue = num(business.monthlyRevenue);
        setBody(buildOfferEmailBody({ application, offerDecision, averageRevenue: fallbackRevenue }));

        // Average revenue = the bank statements' monthly average (same as the Disclosure Calculation).
        let cancelled = false;
        setLoadingRevenue(true);
        axiosGet(`/bank-analysis?${new URLSearchParams({ application: applicationId }).toString()}`)
            .then((res) => {
                if (cancelled) return;
                const data = (res as { data?: { data?: unknown } })?.data?.data ?? res?.data;
                const months = extractMonthlyRevenuesFromBankAnalyses(data).filter((v) => v > 0);
                if (!months.length) return;
                const avg = months.reduce((a, b) => a + b, 0) / months.length;
                // Only replace the line if the user hasn't edited it yet.
                setBody((prev) =>
                    prev.replace(
                        /^Average Revenue:.*$/m,
                        `Average Revenue: $${Math.round(avg).toLocaleString("en-US")}`,
                    ),
                );
            })
            .catch(() => undefined)
            .finally(() => {
                if (!cancelled) setLoadingRevenue(false);
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const handleSend = async () => {
        const toList = splitEmails(to);
        const ccList = splitEmails(cc);
        const bad = [...toList, ...ccList].filter((e) => !EMAIL_RE.test(e));
        if (!toList.length) {
            toast.error("Add at least one recipient in To.");
            return;
        }
        if (bad.length) {
            toast.error(`Check these email addresses: ${bad.join(", ")}`);
            return;
        }
        if (!body.trim()) {
            toast.error("The email body is empty.");
            return;
        }
        setSending(true);
        try {
            await axiosPost("/mail/send", {
                to: toList.join(", "),
                ...(ccList.length ? { cc: ccList } : {}),
                subject: subject.trim() || `OFFER - ${businessName}`,
                body: buildOfferEmailHtml(body, businessName),
                applicationId,
                dealKey: businessName || applicationId,
                templateName: "Offer email",
                category: "email",
            });
            toast.success(`Offer email sent to ${toList.join(", ")}.`);
            onOpenChange(false);
        } catch (error: unknown) {
            const msg =
                (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                "Failed to send the offer email.";
            toast.error(msg);
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next: boolean) => !sending && onOpenChange(next)}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Send offer email</DialogTitle>
                    <DialogDescription>
                        Filled in from this deal. Change anything before sending. Separate several
                        addresses with commas.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label htmlFor="offer-email-to">To</Label>
                        <Input
                            id="offer-email-to"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            placeholder="name@example.com, other@example.com"
                            disabled={sending}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="offer-email-cc">CC</Label>
                        <Input
                            id="offer-email-cc"
                            value={cc}
                            onChange={(e) => setCc(e.target.value)}
                            placeholder="Optional"
                            disabled={sending}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="offer-email-subject">Subject</Label>
                        <Input
                            id="offer-email-subject"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            disabled={sending}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="offer-email-body" className="flex items-center gap-2">
                            Email
                            {loadingRevenue ? (
                                <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Reading average revenue…
                                </span>
                            ) : null}
                        </Label>
                        <Textarea
                            id="offer-email-body"
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={9}
                            className="font-mono text-sm"
                            disabled={sending}
                        />
                        <p className="text-xs text-muted-foreground">
                            Each "LABEL: value" line becomes a row of the email's table.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowPreview((v) => !v)}
                            className="gap-1.5"
                        >
                            {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            {showPreview ? "Hide preview" : "Preview email"}
                        </Button>
                        {showPreview ? (
                            <iframe
                                title="Offer email preview"
                                srcDoc={buildOfferEmailHtml(body, businessName)}
                                sandbox=""
                                className="h-[420px] w-full rounded-md border bg-white"
                            />
                        ) : null}
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={sending}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={() => void handleSend()}
                        disabled={sending}
                        className="bg-[image:var(--brand-gradient)] text-white hover:opacity-90"
                    >
                        {sending ? (
                            <span className="inline-flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Sending…
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-2">
                                <Send className="h-4 w-4" />
                                Send
                            </span>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
