/**
 * Dropbox Sign HTTP endpoints (mounted at /api/v1/dropboxsign).
 *
 * Tracking reuses the Document table (envelopeId column holds the
 * signature_request_id — both are opaque unique strings).
 */
import { Request, Response } from 'express';
import prisma from '../../config/prismaClient';
import {
    isDropboxSignConfigured,
    isDropboxSignEmbeddedConfigured,
    isDropboxSignTestMode,
    getDropboxSignClientId,
} from './dropboxsign.config';
import * as dropboxSign from './dropboxsign.service';
import { listAllDropboxSignApiKeys } from '../docusignAccountProfileService';
import { resolveApiKeyForRequestId, toDocuSignStatus } from './dropboxsign.contract';
import { archiveSignedEnvelopePdf } from '../docusign/utils/archive-signed-envelope-pdf';
import { DocusignService } from '../docusign/docusign.service';

/** Full status pipeline (contract status, deal queue, archive) for webhook events. */
const docusignService = new DocusignService();

function errStatus(err: unknown): number {
    return Number((err as { statusCode?: number })?.statusCode) || 500;
}
function errMessage(err: unknown): string {
    return (err as { message?: string })?.message || 'Dropbox Sign request failed';
}

async function upsertDocumentRow(
    applicationId: string | undefined,
    userId: number | undefined,
    summary: dropboxSign.DropboxSignRequestSummary,
): Promise<void> {
    if (!applicationId || !summary.signatureRequestId) return;
    try {
        await prisma.document.upsert({
            where: { applicationId },
            update: {
                envelopeId: summary.signatureRequestId,
                status: summary.status,
                completedAt: summary.isComplete ? new Date() : null,
            },
            create: {
                applicationId,
                envelopeId: summary.signatureRequestId,
                status: summary.status,
                sentAt: new Date(),
                userId: userId ?? 0,
            },
        });
    } catch (err) {
        console.error('[dropboxsign] Failed to upsert Document row:', errMessage(err));
    }
}

export async function getDropboxSignCapabilities(req: Request, res: Response): Promise<void> {
    res.json({
        configured: isDropboxSignConfigured(),
        embeddedConfigured: isDropboxSignEmbeddedConfigured(),
        testMode: isDropboxSignTestMode(),
        clientId: getDropboxSignClientId(),
    });
}

/**
 * POST /dropboxsign/send
 * multipart (files[] + JSON fields) or JSON with fileUrls[].
 * Body: applicationId?, title?, subject?, message?, signers (JSON array or object),
 *       fileUrls?, useTextTags?, embedded?, ccEmails?
 */
export async function sendSignatureRequest(req: Request, res: Response): Promise<void> {
    try {
        const userId = (req as any).user?.id;
        const body = req.body || {};
        const parseMaybeJson = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);
        const signers = parseMaybeJson(body.signers) as dropboxSign.DropboxSignSigner[];
        const fileUrls = body.fileUrls ? (parseMaybeJson(body.fileUrls) as string[]) : undefined;
        const ccEmails = body.ccEmails ? (parseMaybeJson(body.ccEmails) as string[]) : undefined;
        const uploaded = ((req as any).files as Express.Multer.File[] | undefined) || [];
        const applicationId = body.applicationId ? String(body.applicationId) : undefined;

        const summary = await dropboxSign.sendSignatureRequest({
            title: body.title,
            subject: body.subject,
            message: body.message,
            signers,
            fileUrls,
            ccEmails,
            files: uploaded.map((f) => ({ buffer: f.buffer, filename: f.originalname || 'document.pdf' })),
            useTextTags: body.useTextTags === true || body.useTextTags === 'true',
            embedded: body.embedded === true || body.embedded === 'true',
            metadata: applicationId ? { applicationId } : undefined,
            signingRedirectUrl: body.signingRedirectUrl,
        });
        await upsertDocumentRow(applicationId, userId, summary);
        res.json({ success: true, signatureRequest: summary });
    } catch (err) {
        res.status(errStatus(err)).json({ success: false, message: errMessage(err) });
    }
}

/**
 * POST /dropboxsign/embedded-request-url — sender-view replacement.
 * Returns a claim_url for the Dropbox Sign embedded-requesting iframe.
 */
export async function getEmbeddedRequestUrl(req: Request, res: Response): Promise<void> {
    try {
        const body = req.body || {};
        const parseMaybeJson = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);
        const uploaded = ((req as any).files as Express.Multer.File[] | undefined) || [];
        const applicationId = body.applicationId ? String(body.applicationId) : undefined;
        const requesterEmail =
            String(body.requesterEmail || (req as any).user?.email || '').trim();
        if (!requesterEmail) {
            res.status(400).json({ success: false, message: 'requesterEmail is required' });
            return;
        }
        const draft = await dropboxSign.createEmbeddedDraft({
            requesterEmail,
            title: body.title,
            subject: body.subject,
            message: body.message,
            signers: body.signers ? (parseMaybeJson(body.signers) as dropboxSign.DropboxSignSigner[]) : [],
            fileUrls: body.fileUrls ? (parseMaybeJson(body.fileUrls) as string[]) : undefined,
            files: uploaded.map((f) => ({ buffer: f.buffer, filename: f.originalname || 'document.pdf' })),
            useTextTags: body.useTextTags === true || body.useTextTags === 'true',
            metadata: applicationId ? { applicationId } : undefined,
        });
        res.json({ success: true, claimUrl: draft.claimUrl, expiresAt: draft.expiresAt, clientId: getDropboxSignClientId() });
    } catch (err) {
        res.status(errStatus(err)).json({ success: false, message: errMessage(err) });
    }
}

/** POST /dropboxsign/embedded-sign-link { signatureRequestId, signerEmail } */
export async function getEmbeddedSignLink(req: Request, res: Response): Promise<void> {
    try {
        const { signatureRequestId, signerEmail, signatureId } = req.body || {};
        let sigId = String(signatureId || '').trim();
        const apiKey = signatureRequestId
            ? await resolveApiKeyForRequestId(String(signatureRequestId))
            : undefined;
        if (!sigId) {
            const summary = await dropboxSign.getSignatureRequest(String(signatureRequestId), apiKey);
            const wanted = String(signerEmail || '').trim().toLowerCase();
            const match = wanted
                ? summary.signatures.find((s) => (s.signerEmail || '').toLowerCase() === wanted)
                : summary.signatures[0];
            if (!match) {
                res.status(404).json({ success: false, message: 'Signer not found on this signature request' });
                return;
            }
            sigId = match.signatureId;
        }
        const link = await dropboxSign.getEmbeddedSignUrl(sigId, { apiKey });
        res.json({ success: true, ...link });
    } catch (err) {
        res.status(errStatus(err)).json({ success: false, message: errMessage(err) });
    }
}

/** GET /dropboxsign/status/:signatureRequestId — also refreshes the Document row. */
export async function getStatus(req: Request, res: Response): Promise<void> {
    try {
        const requestId = String(req.params.signatureRequestId);
        const apiKey = await resolveApiKeyForRequestId(requestId);
        const summary = await dropboxSign.getSignatureRequest(requestId, apiKey);
        // Explicit applicationId from the CRM wins; metadata echo is the fallback.
        const applicationId =
            String((req.query as { applicationId?: string })?.applicationId || '').trim() ||
            summary.metadata?.applicationId;
        await upsertDocumentRow(applicationId, (req as any).user?.id, summary);
        // Full pipeline in the background: Contract.status + deal queue
        // (Contract Generated -> Sent -> Signed) + send-history/archive. This
        // is also how editor sends register on localhost, where the Dropbox
        // webhook cannot reach the backend.
        const internalStatus = toDocuSignStatus(summary.status);
        void (async () => {
            try {
                await docusignService.syncDropboxSignEnvelopeInternalStatus(
                    requestId,
                    internalStatus,
                    applicationId,
                );
                if (
                    applicationId &&
                    (internalStatus === 'sent' || internalStatus === 'completed')
                ) {
                    const pdf = await dropboxSign.downloadPdf(requestId, apiKey);
                    await archiveSignedEnvelopePdf({
                        envelopeId: requestId,
                        pdf,
                        applicationId,
                        phase: internalStatus === 'completed' ? 'completed' : 'sent',
                        replaceExisting: internalStatus === 'completed',
                    });
                }
            } catch (e) {
                console.warn('[dropboxsign] status full sync failed:', errMessage(e));
            }
        })();
        res.json({ success: true, signatureRequest: summary });
    } catch (err) {
        res.status(errStatus(err)).json({ success: false, message: errMessage(err) });
    }
}

export async function listRequests(req: Request, res: Response): Promise<void> {
    try {
        const page = Number(req.query.page || 1);
        res.json({ success: true, ...(await dropboxSign.listSignatureRequests(page)) });
    } catch (err) {
        res.status(errStatus(err)).json({ success: false, message: errMessage(err) });
    }
}

/** POST /dropboxsign/cancel { signatureRequestId } — the "void" equivalent. */
export async function cancelRequest(req: Request, res: Response): Promise<void> {
    try {
        const id = String(req.body?.signatureRequestId || '').trim();
        await dropboxSign.cancelSignatureRequest(id, await resolveApiKeyForRequestId(id));
        await prisma.document.updateMany({ where: { envelopeId: id }, data: { status: 'voided' } });
        res.json({ success: true });
    } catch (err) {
        res.status(errStatus(err)).json({ success: false, message: errMessage(err) });
    }
}

/** POST /dropboxsign/remind { signatureRequestId, signerEmail } */
export async function remindSigner(req: Request, res: Response): Promise<void> {
    try {
        const remindId = String(req.body?.signatureRequestId || '');
        await dropboxSign.remindSigner(
            remindId,
            String(req.body?.signerEmail || ''),
            await resolveApiKeyForRequestId(remindId),
        );
        res.json({ success: true });
    } catch (err) {
        res.status(errStatus(err)).json({ success: false, message: errMessage(err) });
    }
}

/** GET /dropboxsign/download/:signatureRequestId — merged PDF (signed when complete). */
export async function downloadPdf(req: Request, res: Response): Promise<void> {
    try {
        const downloadId = String(req.params.signatureRequestId);
        const pdf = await dropboxSign.downloadPdf(
            downloadId,
            await resolveApiKeyForRequestId(downloadId),
        );
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="Cashable Contract.pdf"');
        res.send(pdf);
    } catch (err) {
        res.status(errStatus(err)).json({ success: false, message: errMessage(err) });
    }
}

/**
 * POST /dropboxsign/webhook — Dropbox Sign event callback.
 * Arrives as multipart/form-data with the payload in a "json" form field.
 * MUST answer with a body containing "Hello API Event Received" or Dropbox Sign
 * retries and eventually disables the callback.
 */
export async function dropboxSignWebhook(req: Request, res: Response): Promise<void> {
    // Always acknowledge first-class; processing failures must not trigger retries forever.
    const ack = () => res.status(200).send('Hello API Event Received');
    try {
        const raw = (req.body && (req.body.json ?? req.body)) as unknown;
        const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const event = payload?.event;
        const webhookKeys = await listAllDropboxSignApiKeys();
        if (!event || !dropboxSign.verifyWebhookEvent(event, webhookKeys)) {
            console.warn('[dropboxsign] Webhook event failed verification — ignored');
            ack();
            return;
        }
        const eventType = String(event.event_type || '');
        const sr = payload?.signature_request;
        const signatureRequestId = String(sr?.signature_request_id || '');
        const applicationId = String(sr?.metadata?.applicationId || '') || undefined;
        console.log(`[dropboxsign] Webhook: ${eventType} (${signatureRequestId || 'no request'})`);

        if (signatureRequestId) {
            let status: string | null = null;
            if (eventType === 'signature_request_sent') status = 'sent';
            if (eventType === 'signature_request_viewed') status = 'viewed';
            if (eventType === 'signature_request_signed') status = sr?.is_complete ? 'completed' : 'partially_signed';
            if (eventType === 'signature_request_all_signed') status = 'completed';
            if (eventType === 'signature_request_declined') status = 'declined';
            if (eventType === 'signature_request_canceled') status = 'voided';

            // Run the full contract pipeline in the background: Document +
            // Contract.status + deal queue (Contract Generated -> Sent -> Signed)
            // + signed-PDF archive. The direct Document update below stays as a
            // fallback for envelopes the pipeline does not recognize.
            void docusignService
                .syncDropboxSignEnvelopeInternalStatus(signatureRequestId, status ?? '', applicationId)
                .catch((e) =>
                    console.warn('[dropboxsign] full status sync failed:', errMessage(e)),
                );

            if (status) {
                const data: Record<string, unknown> = { status };
                if (status === 'completed') data.completedAt = new Date();
                const updated = await prisma.document.updateMany({
                    where: { envelopeId: signatureRequestId },
                    data,
                });
                // Embedded-requesting sends arrive here first (the claim URL flow has
                // no request ID at draft time) — create the row from metadata.
                if (updated.count === 0 && applicationId) {
                    await prisma.document
                        .upsert({
                            where: { applicationId },
                            update: { envelopeId: signatureRequestId, status },
                            create: {
                                applicationId,
                                envelopeId: signatureRequestId,
                                status,
                                sentAt: new Date(),
                                userId: 0,
                            },
                        })
                        .catch((e) => console.error('[dropboxsign] Webhook upsert failed:', errMessage(e)));
                }
            }
        }
        ack();
    } catch (err) {
        console.error('[dropboxsign] Webhook processing error:', errMessage(err));
        if (!res.headersSent) ack();
    }
}
