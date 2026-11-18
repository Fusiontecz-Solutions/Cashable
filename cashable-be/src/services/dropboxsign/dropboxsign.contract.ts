/**
 * Bridge: send the platform contract package through Dropbox Sign.
 *
 * The DocuSign layout pipeline (buildPlatformLayoutEnvelopeDefinition) already
 * produces exactly what Dropbox Sign needs: PDFs with the CRM prefill burned in
 * (flattenPrefillInPdf) and per-signer signature tabs with page + x/y
 * coordinates. Both products use points from the page's top-left, so tab
 * coordinates convert 1:1 into form_fields_per_document entries.
 *
 * When Dropbox Sign is the active provider, docusign.service's send path calls
 * sendEnvelopeViaDropboxSign instead of POSTing a DocuSign envelope, and the
 * envelope-id controller endpoints route per request-id shape (DocuSign ids are
 * dashed GUIDs; Dropbox Sign ids are plain hex).
 */
import prisma from '../../config/prismaClient';
import {
    isFillAtSigningTabRef,
    isOptionalSignerEditableTabRef,
} from '../docusign/utils/build-envelope-from-layout';
import {
    getDropboxSignCredentialsForFunder,
    listAllDropboxSignApiKeys,
} from '../docusignAccountProfileService';
import { getDropboxSignApiKey, isDropboxSignConfigured } from './dropboxsign.config';
import * as dropboxSign from './dropboxsign.service';

/** Which API key can read a given signature request (env key or a per-funder account key). */
const apiKeyByRequestId = new Map<string, string>();

export function rememberRequestApiKey(signatureRequestId: string, apiKey?: string): void {
    const key = String(apiKey || '').trim();
    if (signatureRequestId && key) apiKeyByRequestId.set(signatureRequestId, key);
}

/**
 * Find the API key that owns a request id: cached key first, then the env key,
 * then every stored Dropbox Sign account key. Returns undefined for the env key
 * (callers pass it straight through as the override parameter).
 */
export async function resolveApiKeyForRequestId(
    signatureRequestId: string,
): Promise<string | undefined> {
    const cached = apiKeyByRequestId.get(signatureRequestId);
    if (cached) return cached === getDropboxSignApiKey() ? undefined : cached;
    const keys = await listAllDropboxSignApiKeys();
    for (const key of keys) {
        try {
            await dropboxSign.getSignatureRequest(signatureRequestId, key);
            rememberRequestApiKey(signatureRequestId, key);
            return key === getDropboxSignApiKey() ? undefined : key;
        } catch {
            /* not this account — try the next */
        }
    }
    return undefined;
}

/** Dropbox Sign is used for new sends unless SIGNING_PROVIDER forces DocuSign. */
export function isDropboxSignActiveProvider(): boolean {
    const explicit = String(process.env.SIGNING_PROVIDER || '').trim().toLowerCase();
    if (explicit === 'docusign') return false;
    if (explicit === 'dropboxsign' || explicit === 'dropbox') return true;
    return isDropboxSignConfigured();
}

/** DocuSign envelope ids are dashed GUIDs; Dropbox Sign request ids are plain hex. */
export function looksLikeDropboxSignRequestId(id?: string | null): boolean {
    const value = String(id ?? '').trim();
    return /^[0-9a-f]{32,64}$/i.test(value) && !value.includes('-');
}

type EnvelopeTab = Record<string, string | undefined>;

type EnvelopeSigner = {
    name?: string;
    email?: string;
    routingOrder?: string;
    tabs?: {
        textTabs?: EnvelopeTab[];
        dateTabs?: EnvelopeTab[];
        signHereTabs?: EnvelopeTab[];
        initialHereTabs?: EnvelopeTab[];
        dateSignedTabs?: EnvelopeTab[];
    };
};

type EnvelopeDefinition = {
    emailSubject?: string;
    emailBlurb?: string;
    documents?: Array<{ documentId?: string; name?: string; documentBase64?: string }>;
    recipients?: {
        signers?: EnvelopeSigner[];
        carbonCopies?: Array<{ email?: string }>;
    };
};

// Heights must fit inside the form rows (~22pt leading on the contract pages),
// or the signing boxes visually spill onto the next signer's line.
const FIELD_SIZE: Record<string, { width: number; height: number }> = {
    signature: { width: 130, height: 20 },
    // Small box = small rendered initials; keep it inside the footer blank.
    initials: { width: 42, height: 12 },
    date_signed: { width: 100, height: 16 },
    text: { width: 160, height: 16 },
    'text-merge': { width: 160, height: 16 },
};

function tabToFormField(
    tab: EnvelopeTab,
    type: 'signature' | 'initials' | 'date_signed' | 'text' | 'text-merge',
    signer: number | string,
    apiId: string,
    name?: string,
): Record<string, unknown> | null {
    const page = Number(tab.pageNumber);
    const x = Number(tab.xPosition);
    const y = Number(tab.yPosition);
    if (!Number.isFinite(page) || page < 1 || !Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }
    const width = Number(tab.width) > 0 ? Number(tab.width) : FIELD_SIZE[type].width;
    const height = Number(tab.height) > 0 ? Number(tab.height) : FIELD_SIZE[type].height;
    // Text-type fields otherwise default to Helvetica 12 in Dropbox Sign;
    // all documents render prefill/editor text as Arial 9.
    const isTextual = type === 'text' || type === 'text-merge' || type === 'date_signed';
    return {
        api_id: apiId.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 45),
        ...(name ? { name } : {}),
        type,
        page,
        x: Math.max(0, Math.round(x)),
        y: Math.max(0, Math.round(y)),
        width: Math.round(width),
        height: Math.round(height),
        signer,
        required: type === 'signature' || type === 'initials',
        ...(isTextual ? { font_family: 'arial', font_size: 10 } : {}),
    };
}

/**
 * DocuSign-sender-view parity: every prefilled text/date tab becomes a live
 * \`text-merge\` field whose value is supplied via custom_fields - visible,
 * movable, and correctable in the embedded editor before sending. Empty text
 * tabs become \`me_now\` fields the preparer can fill in the editor.
 */
function buildFieldsAndCustomValues(
    documents: Array<{ documentId?: string }>,
    validSigners: EnvelopeSigner[],
): {
    formFieldsPerDocument: Array<Array<Record<string, unknown>>>;
    customFields: Array<{ name: string; value: string }>;
} {
    const docIndexByDocumentId = new Map<string, number>();
    documents.forEach((doc, idx) => docIndexByDocumentId.set(String(doc.documentId || idx + 1), idx));
    const formFieldsPerDocument: Array<Array<Record<string, unknown>>> = documents.map(() => []);
    const customFields: Array<{ name: string; value: string }> = [];
    let globalSeq = 0;
    validSigners.forEach((signerRow, signerIndex) => {
        const tabs = signerRow.tabs || {};
        const buckets: Array<[
            EnvelopeTab[] | undefined,
            'signature' | 'initials' | 'date_signed' | 'text',
        ]> = [
            [tabs.signHereTabs, 'signature'],
            [tabs.initialHereTabs, 'initials'],
            [tabs.dateSignedTabs, 'date_signed'],
            [tabs.textTabs, 'text'],
            [tabs.dateTabs, 'text'],
        ];
        for (const [tabList, baseType] of buckets) {
            for (const tab of tabList || []) {
                const docIdx = docIndexByDocumentId.get(String(tab.documentId || '1')) ?? 0;
                globalSeq += 1;
                const apiId = `s${signerIndex}_f${globalSeq}_${String(tab.tabLabel || baseType).trim()}`;
                let field: Record<string, unknown> | null;
                if (baseType === 'text') {
                    const value = String((tab as { value?: string }).value ?? '').trim();
                    if (value) {
                        const mergeName = `mf_${globalSeq}`;
                        field = tabToFormField(tab, 'text-merge', 'sender', apiId, mergeName);
                        if (field) {
                            // Dropbox Sign rejects values longer than the box fits
                            // (~7pt/char): grow the box to the value, up to the
                            // page margin, then add lines for the remainder.
                            const CHAR_W = 7.2;
                            const x = Number(field.x) || 0;
                            const needed = value.length * CHAR_W + 14;
                            // Must grow to fit the value or Dropbox Sign rejects the
                            // send ("value too long"); flattened docs never hit this.
                            const maxW = Math.max(60, 604 - x);
                            const width = Math.min(Math.max(Number(field.width) || 0, needed), maxW);
                            field.width = Math.round(width);
                            if (needed > width) {
                                const lines = Math.ceil(needed / width);
                                field.height = Math.max(Number(field.height) || 16, lines * 15 + 4);
                            }
                            customFields.push({ name: mergeName, value });
                        }
                    } else if (/signature_date|date_signed/i.test(String(tab.tabLabel || ''))) {
                        // Signing-date tabs auto-stamp when the signer signs.
                        field = tabToFormField(tab, 'date_signed', signerIndex, apiId);
                    } else if (isFillAtSigningTabRef(tab)) {
                        // Bank-access details etc. — the SIGNER completes these.
                        // No `name`: Dropbox Sign renders a text field's name as
                        // visible placeholder text inside the box ("tf_83").
                        field = tabToFormField(tab, 'text', signerIndex, apiId);
                        // client_phone / following-days stay optional.
                        if (field) field.required = !isOptionalSignerEditableTabRef(tab);
                    } else {
                        // Unique api_id keeps fields unlinked; no display name.
                        field = tabToFormField(tab, 'text', 'me_now', apiId);
                    }
                } else {
                    field = tabToFormField(tab, baseType, signerIndex, apiId);
                }
                if (field) formFieldsPerDocument[docIdx].push(field);
            }
        }
    });
    return { formFieldsPerDocument, customFields };
}

/**
 * Dropbox Sign rejects anything but an absolute public http(s) URL for
 * signing_redirect_url. DocuSign return URLs are often relative paths or
 * localhost — drop those rather than failing the whole send.
 */
function sanitizeSigningRedirectUrl(url?: string | null): string | undefined {
    const value = String(url ?? '').trim();
    if (!/^https?:\/\//i.test(value)) return undefined;
    try {
        const parsed = new URL(value);
        const host = parsed.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
            return undefined;
        }
        return parsed.toString();
    } catch {
        return undefined;
    }
}

export type DropboxSignEnvelopeSendResult = {
    success: boolean;
    documentId: string;
    envelopeId: string;
    sendUrl: string | null;
    message: string;
    data: Record<string, unknown>;
};

/**
 * Send a built envelope definition as a Dropbox Sign signature request.
 * Always sends immediately (there is no post-create sender view here; the CRM's
 * Verify Prefill step is the review surface, and fields are pre-placed).
 */
export async function sendEnvelopeViaDropboxSign(options: {
    envelopeDefinition: EnvelopeDefinition;
    applicationId?: string;
    userId?: string | number;
    ccEmails?: string[];
    redirectUrl?: string;
    /** Standalone ACH — the Document row link is managed by the caller/FE. */
    skipApplicationEnvelopeLink?: boolean;
    layoutKeys?: string[];
    /** Per-funder account routing — falls back to the env API key. */
    funderProfileId?: string | null;
    funderName?: string | null;
}): Promise<DropboxSignEnvelopeSendResult> {
    const envelope = options.envelopeDefinition || {};
    const documents = envelope.documents || [];
    if (!documents.length) {
        throw Object.assign(new Error('Envelope has no documents to send.'), { statusCode: 400 });
    }
    const envelopeSigners = envelope.recipients?.signers || [];
    const validSigners = envelopeSigners.filter((s) => String(s.email || '').trim());
    if (!validSigners.length) {
        throw Object.assign(new Error('Envelope has no signers with an email.'), { statusCode: 400 });
    }

    const files = documents.map((doc, idx) => ({
        buffer: Buffer.from(String(doc.documentBase64 || ''), 'base64'),
        filename: `${String(doc.name || `Document ${idx + 1}`).replace(/[\\/:*?"<>|]/g, ' ')}.pdf`,
    }));

    const signers: dropboxSign.DropboxSignSigner[] = validSigners.map((s, idx) => ({
        name: String(s.name || '').trim() || String(s.email).trim(),
        email: String(s.email).trim(),
        order: Number(s.routingOrder) > 0 ? Number(s.routingOrder) - 1 : idx,
    }));

    const { formFieldsPerDocument, customFields: mergeCustomFields } =
        buildFieldsAndCustomValues(documents, validSigners);

    const hasSignatureField = formFieldsPerDocument.some((fields) =>
        fields.some((f) => f.type === 'signature' || f.type === 'initials'),
    );
    if (!hasSignatureField) {
        // Without any placed signature field Dropbox Sign would reject or send an
        // unsignable request — fall back to text-tag-free "sign anywhere" default
        // by placing one signature per signer on the last page is NOT possible
        // blindly, so surface it instead.
        throw Object.assign(
            new Error(
                'No signature placements found on the contract layouts; cannot send via Dropbox Sign.',
            ),
            { statusCode: 400 },
        );
    }

    const ccEmails = [
        ...new Set(
            [
                ...(options.ccEmails || []),
                ...((envelope.recipients?.carbonCopies || []).map((c) => String(c.email || '').trim())),
            ]
                .map((e) => e.trim())
                .filter(Boolean),
        ),
    ];

    const funderCredentials = await getDropboxSignCredentialsForFunder({
        funderProfileId: options.funderProfileId,
        funderName: options.funderName,
    }).catch(() => null);

    const summary = await dropboxSign.sendSignatureRequest({
        credentials: funderCredentials ?? undefined,
        title: String(envelope.emailSubject || 'Contract').slice(0, 200),
        subject: String(envelope.emailSubject || 'Please sign this document').slice(0, 200),
        message: String(envelope.emailBlurb || ''),
        signers,
        files,
        ccEmails,
        formFieldsPerDocument,
        customFields: mergeCustomFields,
        metadata: options.applicationId ? { applicationId: String(options.applicationId) } : undefined,
        signingRedirectUrl: sanitizeSigningRedirectUrl(options.redirectUrl),
    });
    rememberRequestApiKey(summary.signatureRequestId, funderCredentials?.apiKey);

    if (options.applicationId && options.skipApplicationEnvelopeLink !== true) {
        const userIdNum = Number(options.userId);
        await prisma.document
            .upsert({
                where: { applicationId: String(options.applicationId) },
                update: { envelopeId: summary.signatureRequestId, status: 'sent', completedAt: null },
                create: {
                    applicationId: String(options.applicationId),
                    envelopeId: summary.signatureRequestId,
                    status: 'sent',
                    sentAt: new Date(),
                    userId: Number.isFinite(userIdNum) ? userIdNum : 0,
                },
            })
            .catch((err) =>
                console.error('[dropboxsign] Document link upsert failed:', err?.message || err),
            );
    }

    return {
        success: true,
        documentId: summary.signatureRequestId,
        envelopeId: summary.signatureRequestId,
        sendUrl: null,
        message: 'Contract sent via Dropbox Sign; signing email delivered to the signer.',
        data: {
            envelopeStatus: 'sent',
            autoSend: true,
            provider: 'dropboxsign',
            layoutKeys: options.layoutKeys || [],
            envelopeSigners: signers.map((s) => ({ name: s.name, email: s.email })),
            nextStep: 'Signers were emailed by Dropbox Sign.',
        },
    };
}

/**
 * Embedded-requesting draft: same composed package and pre-placed fields, but
 * instead of sending, Dropbox Sign returns a claim URL the CRM opens in its
 * embedded editor. The admin reviews/edits fields there and clicks Send; the
 * resulting signature_request arrives on the `signature_request_sent` webhook
 * (matched to the deal via metadata.applicationId).
 */
export async function draftEnvelopeViaDropboxSign(options: {
    envelopeDefinition: EnvelopeDefinition;
    applicationId?: string;
    requesterEmail: string;
    ccEmails?: string[];
    funderProfileId?: string | null;
    funderName?: string | null;
}): Promise<DropboxSignEnvelopeSendResult & { clientId: string; provider: string; testMode: boolean }> {
    const envelope = options.envelopeDefinition || {};
    const documents = envelope.documents || [];
    if (!documents.length) {
        throw Object.assign(new Error('Envelope has no documents to send.'), { statusCode: 400 });
    }
    const envelopeSigners = envelope.recipients?.signers || [];
    const validSigners = envelopeSigners.filter((s) => String(s.email || '').trim());
    if (!validSigners.length) {
        throw Object.assign(new Error('Envelope has no signers with an email.'), { statusCode: 400 });
    }

    const files = documents.map((doc, idx) => ({
        buffer: Buffer.from(String(doc.documentBase64 || ''), 'base64'),
        filename: `${String(doc.name || `Document ${idx + 1}`).replace(/[\/:*?"<>|]/g, ' ')}.pdf`,
    }));
    const signers: dropboxSign.DropboxSignSigner[] = validSigners.map((s, idx) => ({
        name: String(s.name || '').trim() || String(s.email).trim(),
        email: String(s.email).trim(),
        order: Number(s.routingOrder) > 0 ? Number(s.routingOrder) - 1 : idx,
    }));
    const { formFieldsPerDocument, customFields: mergeCustomFields } =
        buildFieldsAndCustomValues(documents, validSigners);
    const ccEmails = [
        ...new Set(
            [
                ...(options.ccEmails || []),
                ...((envelope.recipients?.carbonCopies || []).map((c) => String(c.email || '').trim())),
            ]
                .map((e) => e.trim())
                .filter(Boolean),
        ),
    ];

    const funderCredentials = await getDropboxSignCredentialsForFunder({
        funderProfileId: options.funderProfileId,
        funderName: options.funderName,
    }).catch(() => null);

    const draft = await dropboxSign.createEmbeddedDraft({
        credentials: funderCredentials ?? undefined,
        requesterEmail: options.requesterEmail,
        title: String(envelope.emailSubject || 'Contract').slice(0, 200),
        subject: String(envelope.emailSubject || 'Please sign this document').slice(0, 200),
        message: String(envelope.emailBlurb || ''),
        signers,
        files,
        ccEmails,
        formFieldsPerDocument,
        customFields: mergeCustomFields,
        metadata: options.applicationId ? { applicationId: String(options.applicationId) } : undefined,
    });

    const { getDropboxSignClientId } = await import('./dropboxsign.config');
    return {
        success: true,
        documentId: '',
        envelopeId: '',
        sendUrl: draft.claimUrl,
        clientId:
            String(funderCredentials?.clientId || '').trim() || getDropboxSignClientId(),
        provider: 'dropboxsign',
        testMode: (await import('./dropboxsign.config')).isDropboxSignTestMode(),
        message:
            'Dropbox Sign draft is ready. Review the document in the embedded editor and click Send there.',
        data: { envelopeStatus: 'created', autoSend: false, provider: 'dropboxsign' },
    };
}

/** Map a Dropbox Sign summary status onto the DocuSign status vocabulary the FE expects. */
export function toDocuSignStatus(status: dropboxSign.DropboxSignRequestSummary['status']): string {
    if (status === 'completed') return 'completed';
    if (status === 'declined') return 'declined';
    if (status === 'canceled') return 'voided';
    if (status === 'partially_signed') return 'signed';
    if (status === 'viewed') return 'viewed';
    return 'sent';
}
