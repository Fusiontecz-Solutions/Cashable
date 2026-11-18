/**
 * Dropbox Sign (HelloSign) API client for the Cashable contract flow.
 *
 * DocuSign-concept mapping:
 *   envelope                      → signature request (signature_request_id)
 *   recipient                     → signer (signature_id per signer)
 *   embedded recipient view       → embedded signing (GET /embedded/sign_url/:signature_id)
 *   embedded sender view          → embedded requesting (unclaimed draft claim_url —
 *                                   the admin places fields and sends inside an iframe)
 *   Connect webhook               → API App event callback (multipart POST, field "json")
 *
 * Post-send edits do not exist here: to change documents/fields on an in-flight
 * request, cancel it and send a new one. Signer email/name CAN be swapped in
 * place (POST /signature_request/update/:id).
 */
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import FormData from 'form-data';
import {
    DROPBOX_SIGN_API_BASE,
    getDropboxSignApiKey,
    getDropboxSignClientId,
    isDropboxSignTestMode,
} from './dropboxsign.config';

export type DropboxSignSigner = {
    name: string;
    email: string;
    /** 0-based signing order; omit everywhere for parallel signing. */
    order?: number;
};

export type SendSignatureRequestOptions = {
    title?: string;
    subject?: string;
    message?: string;
    signers: DropboxSignSigner[];
    /** Raw PDFs to send (preferred — the prefilled contract pack). */
    files?: Array<{ buffer: Buffer; filename: string }>;
    /** Publicly reachable URLs as an alternative to raw files. */
    fileUrls?: string[];
    /** Parse HelloSign text tags ([sig|req|signer1], …) embedded in the PDFs. */
    useTextTags?: boolean;
    /** Create for embedded signing (sign inside the CRM) instead of email delivery. */
    embedded?: boolean;
    /** CC addresses (get the completed doc, do not sign). */
    ccEmails?: string[];
    /** Arbitrary metadata echoed back on every webhook event (we set applicationId). */
    metadata?: Record<string, string>;
    /** Where Dropbox Sign redirects a non-embedded signer after signing. */
    signingRedirectUrl?: string;
    /**
     * Pre-placed fields, one inner array per file (same order as files/fileUrls).
     * Entries: { api_id, type, x, y, width, height, page, signer (0-based), required }.
     * Coordinates are points from the page's top-left — same units as Dropbox Sign tabs.
     */
    formFieldsPerDocument?: Array<Array<Record<string, unknown>>>;
    /** Per-funder account override; falls back to the env API key / client ID. */
    credentials?: DropboxSignCredentials;
    /** Values for text-merge fields (name must match the field's name). */
    customFields?: Array<{ name: string; value: string }>;
};

export type DropboxSignCredentials = { apiKey?: string; clientId?: string };

export type DropboxSignRequestSummary = {
    signatureRequestId: string;
    title: string;
    isComplete: boolean;
    isDeclined: boolean;
    status: 'sent' | 'viewed' | 'partially_signed' | 'completed' | 'declined' | 'canceled' | 'error';
    detailsUrl?: string;
    signatures: Array<{
        signatureId: string;
        signerName: string | null;
        signerEmail: string | null;
        statusCode: string;
        signedAt: number | null;
        lastViewedAt: number | null;
    }>;
    metadata: Record<string, string>;
};

function requireApiKey(override?: string): string {
    const key = String(override || '').trim() || getDropboxSignApiKey();
    if (!key) {
        throw Object.assign(
            new Error('Dropbox Sign is not configured. Set DROPBOX_SIGN_API_KEY in the backend .env.'),
            { statusCode: 503 },
        );
    }
    return key;
}

function client(apiKeyOverride?: string): AxiosInstance {
    return axios.create({
        baseURL: DROPBOX_SIGN_API_BASE,
        auth: { username: requireApiKey(apiKeyOverride), password: '' },
        timeout: 60_000,
    });
}

function apiError(context: string, err: unknown): Error {
    const anyErr = err as { response?: { status?: number; data?: { error?: { error_msg?: string } } }; message?: string };
    const msg =
        anyErr?.response?.data?.error?.error_msg || anyErr?.message || 'Unknown Dropbox Sign error';
    return Object.assign(new Error(`${context}: ${msg}`), {
        statusCode: anyErr?.response?.status || 502,
    });
}

/** Append shared send fields (signers, files, metadata, flags) onto a form. */
function appendCommonSendFields(form: FormData, options: SendSignatureRequestOptions): void {
    if (options.title) form.append('title', options.title);
    if (options.subject) form.append('subject', options.subject);
    if (options.message) form.append('message', options.message);
    if (isDropboxSignTestMode()) form.append('test_mode', '1');
    if (options.useTextTags) form.append('use_text_tags', '1');

    options.signers.forEach((signer, i) => {
        form.append(`signers[${i}][name]`, signer.name);
        form.append(`signers[${i}][email_address]`, signer.email);
        if (typeof signer.order === 'number') form.append(`signers[${i}][order]`, String(signer.order));
    });
    (options.ccEmails || []).forEach((email, i) => {
        form.append(`cc_email_addresses[${i}]`, email);
    });
    (options.files || []).forEach((file, i) => {
        form.append(`files[${i}]`, file.buffer, { filename: file.filename, contentType: 'application/pdf' });
    });
    (options.fileUrls || []).forEach((url, i) => {
        form.append(`file_urls[${i}]`, url);
    });
    Object.entries(options.metadata || {}).forEach(([key, value]) => {
        form.append(`metadata[${key}]`, value);
    });
    if (options.signingRedirectUrl) form.append('signing_redirect_url', options.signingRedirectUrl);
    if (options.formFieldsPerDocument?.some((fields) => fields.length > 0)) {
        form.append('form_fields_per_document', JSON.stringify(options.formFieldsPerDocument));
    }
    if (options.customFields?.length) {
        form.append('custom_fields', JSON.stringify(options.customFields));
    }
}

function toSummary(sr: Record<string, any>): DropboxSignRequestSummary {
    const signatures = (sr.signatures || []).map((s: Record<string, any>) => ({
        signatureId: String(s.signature_id || ''),
        signerName: s.signer_name ?? null,
        signerEmail: s.signer_email_address ?? null,
        statusCode: String(s.status_code || ''),
        signedAt: s.signed_at ?? null,
        lastViewedAt: s.last_viewed_at ?? null,
    }));
    const anySigned = signatures.some((s: { statusCode: string }) => s.statusCode === 'signed');
    const anyViewed = signatures.some(
        (s: { lastViewedAt: number | null }) => s.lastViewedAt != null,
    );
    let status: DropboxSignRequestSummary['status'] = 'sent';
    if (sr.is_declined) status = 'declined';
    else if (sr.is_complete) status = 'completed';
    else if (anySigned) status = 'partially_signed';
    else if (anyViewed) status = 'viewed';
    return {
        signatureRequestId: String(sr.signature_request_id || ''),
        title: String(sr.title || ''),
        isComplete: Boolean(sr.is_complete),
        isDeclined: Boolean(sr.is_declined),
        status,
        detailsUrl: sr.details_url,
        signatures,
        metadata: (sr.metadata || {}) as Record<string, string>,
    };
}

/** Send a signature request (email-delivered or embedded). */
export async function sendSignatureRequest(
    options: SendSignatureRequestOptions,
): Promise<DropboxSignRequestSummary> {
    if (!options.signers?.length) {
        throw Object.assign(new Error('At least one signer is required.'), { statusCode: 400 });
    }
    if (!options.files?.length && !options.fileUrls?.length) {
        throw Object.assign(new Error('At least one file or file URL is required.'), { statusCode: 400 });
    }
    const form = new FormData();
    appendCommonSendFields(form, options);

    let path = '/signature_request/send';
    if (options.embedded) {
        const clientId = String(options.credentials?.clientId || '').trim() || getDropboxSignClientId();
        if (!clientId) {
            throw Object.assign(
                new Error('Embedded signing needs DROPBOX_SIGN_CLIENT_ID (an approved API App).'),
                { statusCode: 503 },
            );
        }
        form.append('client_id', clientId);
        path = '/signature_request/create_embedded';
    }

    try {
        const res = await client(options.credentials?.apiKey).post(path, form, { headers: form.getHeaders() });
        return toSummary(res.data?.signature_request || {});
    } catch (err) {
        throw apiError('Dropbox Sign send failed', err);
    }
}

/**
 * Embedded requesting — the DocuSign "sender view" replacement. Returns a
 * claim_url the frontend opens in the Dropbox Sign iframe; the admin places
 * fields there and sends. The resulting signature_request_id arrives on the
 * `signature_request_sent` webhook event (match it via metadata.applicationId).
 */
export async function createEmbeddedDraft(
    options: SendSignatureRequestOptions & { requesterEmail: string },
): Promise<{ claimUrl: string; expiresAt: number }> {
    const clientId = String(options.credentials?.clientId || '').trim() || getDropboxSignClientId();
    if (!clientId) {
        throw Object.assign(
            new Error('Embedded requesting needs DROPBOX_SIGN_CLIENT_ID (an approved API App).'),
            { statusCode: 503 },
        );
    }
    const form = new FormData();
    form.append('client_id', clientId);
    form.append('type', 'request_signature');
    form.append('requester_email_address', options.requesterEmail);
    // Let the admin edit signers/fields inside the iframe before sending.
    form.append('is_for_embedded_signing', '0');
    appendCommonSendFields(form, options);
    try {
        const res = await client(options.credentials?.apiKey).post('/unclaimed_draft/create_embedded', form, {
            headers: form.getHeaders(),
        });
        const draft = res.data?.unclaimed_draft || {};
        return { claimUrl: String(draft.claim_url || ''), expiresAt: Number(draft.expires_at || 0) };
    } catch (err) {
        throw apiError('Dropbox Sign embedded draft failed', err);
    }
}

/** Embedded signing URL for one signer (expires ~3 min after first open). */
export async function getEmbeddedSignUrl(
    signatureId: string,
    credentials?: DropboxSignCredentials,
): Promise<{ signUrl: string; expiresAt: number; clientId: string }> {
    try {
        const res = await client(credentials?.apiKey).get(`/embedded/sign_url/${encodeURIComponent(signatureId)}`);
        const embedded = res.data?.embedded || {};
        return {
            signUrl: String(embedded.sign_url || ''),
            expiresAt: Number(embedded.expires_at || 0),
            clientId: String(credentials?.clientId || '').trim() || getDropboxSignClientId(),
        };
    } catch (err) {
        throw apiError('Dropbox Sign embedded sign URL failed', err);
    }
}

export async function getSignatureRequest(
    signatureRequestId: string,
    apiKey?: string,
): Promise<DropboxSignRequestSummary> {
    try {
        const res = await client(apiKey).get(`/signature_request/${encodeURIComponent(signatureRequestId)}`);
        return toSummary(res.data?.signature_request || {});
    } catch (err) {
        throw apiError('Dropbox Sign status fetch failed', err);
    }
}

export async function listSignatureRequests(page = 1, pageSize = 20): Promise<{
    page: number;
    numPages: number;
    requests: DropboxSignRequestSummary[];
}> {
    try {
        const res = await client().get('/signature_request/list', {
            params: { page, page_size: pageSize },
        });
        return {
            page: Number(res.data?.list_info?.page || page),
            numPages: Number(res.data?.list_info?.num_pages || 1),
            requests: (res.data?.signature_requests || []).map(toSummary),
        };
    } catch (err) {
        throw apiError('Dropbox Sign list failed', err);
    }
}

/** Cancel an in-flight request (the Dropbox Sign equivalent of voiding an envelope). */
export async function cancelSignatureRequest(signatureRequestId: string, apiKey?: string): Promise<void> {
    try {
        await client(apiKey).post(`/signature_request/cancel/${encodeURIComponent(signatureRequestId)}`);
    } catch (err) {
        throw apiError('Dropbox Sign cancel failed', err);
    }
}

/** Email a reminder to one signer (not available for embedded signing). */
export async function remindSigner(signatureRequestId: string, email: string, apiKey?: string): Promise<void> {
    const form = new FormData();
    form.append('email_address', email);
    try {
        await client(apiKey).post(
            `/signature_request/remind/${encodeURIComponent(signatureRequestId)}`,
            form,
            { headers: form.getHeaders() },
        );
    } catch (err) {
        throw apiError('Dropbox Sign remind failed', err);
    }
}

/** Download the (merged) PDF — signed version once complete. */
export async function downloadPdf(signatureRequestId: string, apiKey?: string): Promise<Buffer> {
    try {
        const res = await client(apiKey).get(
            `/signature_request/files/${encodeURIComponent(signatureRequestId)}`,
            { params: { file_type: 'pdf' }, responseType: 'arraybuffer' },
        );
        return Buffer.from(res.data);
    } catch (err) {
        throw apiError('Dropbox Sign download failed', err);
    }
}

/**
 * Verify a callback event: event_hash is HMAC-SHA256 of `${event_time}${event_type}`
 * keyed with the API key. Reject anything that does not verify.
 */
export function verifyWebhookEvent(
    event: {
        event_time?: string | number;
        event_type?: string;
        event_hash?: string;
    },
    apiKeys?: string[],
): boolean {
    const keys = (apiKeys?.length ? apiKeys : [getDropboxSignApiKey()]).filter(Boolean);
    if (!keys.length || !event?.event_hash || !event?.event_time || !event?.event_type) return false;
    const received = Buffer.from(String(event.event_hash));
    for (const key of keys) {
        const expected = crypto
            .createHmac('sha256', key)
            .update(`${event.event_time}${event.event_type}`)
            .digest('hex');
        try {
            if (crypto.timingSafeEqual(Buffer.from(expected), received)) return true;
        } catch {
            /* length mismatch — try next key */
        }
    }
    return false;
}
