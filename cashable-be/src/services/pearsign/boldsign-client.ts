import axios from 'axios';
import { PearSignApiError, type PearSignEnvelopeDetails } from './pearsign-client';

/**
 * BoldSign REST client (US: https://api.boldsign.com, `X-API-KEY`). The CRM's signing flow
 * (staged package → Review → send → status / void / download) is shared with PearSign; a BoldSign
 * document is stored in the CRM as `bs-<documentId>`, and the PearSign client functions route
 * those ids here, so sync, void, download, notices and deal stages work for both providers.
 *
 * Coordinates: BoldSign field bounds are 96-DPI pixels from the page's top-left (measured: a field
 * at x=100 lands at 75 PDF points), so CRM layout points are scaled by 4/3.
 *
 * Env: BOLDSIGN_API_KEY, BOLDSIGN_API_BASE (default US), BOLDSIGN_SANDBOX=true (test documents),
 * BOLDSIGN_BRAND_ID (optional), SIGNING_PROVIDER=boldsign to send new contracts via BoldSign.
 */

export const BOLDSIGN_ID_PREFIX = 'bs-';
/** CRM layout points → BoldSign 96-DPI pixels. */
export const BOLDSIGN_PX_PER_PT = 96 / 72;

function apiKey(): string {
  return String(process.env.BOLDSIGN_API_KEY || '').trim();
}
function apiBase(): string {
  return String(process.env.BOLDSIGN_API_BASE || 'https://api.boldsign.com').trim().replace(/\/+$/, '');
}

export function isBoldSignConfigured(): boolean {
  return apiKey().length > 0;
}

/** Which service new contracts are sent through: `SIGNING_PROVIDER=boldsign`, else PearSign. */
export function signingProvider(): 'pearsign' | 'boldsign' {
  return String(process.env.SIGNING_PROVIDER || '').trim().toLowerCase() === 'boldsign' ? 'boldsign' : 'pearsign';
}

/** BoldSign test documents (not legally binding, no allowance used). */
export function boldSignSandbox(): boolean {
  return String(process.env.BOLDSIGN_SANDBOX || '').trim().toLowerCase() === 'true';
}

export function isBoldSignEnvelopeId(id?: string | null): boolean {
  return /^bs-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id ?? '').trim());
}
export function toBoldSignEnvelopeId(documentId: string): string {
  return `${BOLDSIGN_ID_PREFIX}${String(documentId).trim()}`;
}
export function boldSignDocumentId(envelopeId: string): string {
  return String(envelopeId).trim().replace(/^bs-/i, '');
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts: { data?: unknown; params?: Record<string, unknown>; binary?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const key = apiKey();
  if (!key) throw new PearSignApiError('BOLDSIGN_API_KEY is not set in .env', 0);
  const res = await axios.request({
    method,
    url: `${apiBase()}${path}`,
    data: opts.data,
    params: opts.params,
    headers: {
      'X-API-KEY': key,
      ...(opts.data !== undefined ? { 'Content-Type': 'application/json' } : {}),
      Accept: opts.binary ? 'application/pdf' : 'application/json',
    },
    responseType: opts.binary ? 'arraybuffer' : 'json',
    timeout: opts.timeoutMs ?? 60_000,
    maxBodyLength: 60 * 1024 * 1024,
    maxContentLength: 60 * 1024 * 1024,
    validateStatus: () => true,
  });
  if (res.status >= 200 && res.status < 300) return res.data as T;
  let body: unknown = res.data;
  if (opts.binary && body) {
    try {
      body = JSON.parse(Buffer.from(body as ArrayBuffer).toString('utf8'));
    } catch {
      /* not JSON */
    }
  }
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, any>;
  const errors = b.errors && typeof b.errors === 'object' ? Object.values(b.errors).flat().join('; ') : '';
  const msg = String(b.error || b.message || b.title || errors || `HTTP ${res.status}`);
  console.warn(`[BoldSign] ${method} ${path} → ${res.status}: ${msg}${errors && errors !== msg ? ` (${errors})` : ''}`);
  throw new PearSignApiError(`BoldSign ${method} ${path} failed: ${msg}${errors && errors !== msg ? ` (${errors})` : ''}`, res.status, body);
}

// ---------- types ----------

export type BoldSignFormField = {
  id: string;
  name?: string;
  fieldType: 'Signature' | 'Initial' | 'TextBox' | 'DateSigned' | 'CheckBox';
  pageNumber: number;
  bounds: { x: number; y: number; width: number; height: number };
  isRequired?: boolean;
  isReadOnly?: boolean;
  value?: string;
  font?: 'Helvetica' | 'Courier' | 'TimesRoman' | 'NotoSans' | 'Carlito';
  fontSize?: number;
  textAlign?: 'Left' | 'Center' | 'Right';
};

export type BoldSignSigner = {
  name: string;
  emailAddress: string;
  signerOrder?: number;
  signerType?: 'Signer';
  formFields: BoldSignFormField[];
};

export type BoldSignSendInput = {
  title: string;
  message?: string;
  /** PDFs as base64 (without the data: prefix). */
  pdfBase64: string[];
  signers: BoldSignSigner[];
  enableSigningOrder?: boolean;
  expiryDays?: number;
  disableEmails?: boolean;
  metaData?: Record<string, string>;
  downloadFileName?: string;
};

function sendBody(input: BoldSignSendInput) {
  const brandId = String(process.env.BOLDSIGN_BRAND_ID || '').trim();
  return {
    title: input.title.slice(0, 256),
    message: (input.message || '').slice(0, 5000),
    files: input.pdfBase64.map((b64) => `data:application/pdf;base64,${b64}`),
    signers: input.signers.map((s) => ({ signerType: 'Signer', ...s })),
    enableSigningOrder: input.enableSigningOrder ?? input.signers.length > 1,
    expiryDays: input.expiryDays ?? 30,
    disableEmails: input.disableEmails ?? false,
    hideDocumentId: true,
    isSandbox: boldSignSandbox(),
    ...(brandId ? { brandId } : {}),
    ...(input.metaData ? { metaData: input.metaData } : {}),
    ...(input.downloadFileName ? { downloadFileName: input.downloadFileName.slice(0, 200) } : {}),
  };
}

// ---------- documents ----------

/** Send for signature now. BoldSign emails each signer (in signing order). */
export async function boldSignSendDocument(input: BoldSignSendInput): Promise<{ documentId: string }> {
  return request<{ documentId: string }>('POST', '/v1/document/send', { data: sendBody(input), timeoutMs: 180_000 });
}

/**
 * A draft opened in BoldSign's own editor (prepare page): fields can be moved, resized or added,
 * and the document is sent when the user clicks Send there. The link works in an iframe or tab.
 */
export async function boldSignCreateEmbeddedSend(
  input: BoldSignSendInput & { redirectUrl?: string; linkValidTill?: Date },
): Promise<{ documentId: string; sendUrl: string }> {
  return request<{ documentId: string; sendUrl: string }>('POST', '/v1/document/createEmbeddedRequestUrl', {
    data: {
      ...sendBody(input),
      showToolbar: true,
      sendViewOption: 'PreparePage',
      showSaveButton: false,
      showSendButton: true,
      showPreviewButton: true,
      showNavigationButtons: true,
      ...(input.redirectUrl ? { redirectUrl: input.redirectUrl } : {}),
      embeddedSendLinkValidTill: (input.linkValidTill ?? new Date(Date.now() + 24 * 3600_000)).toISOString(),
    },
    timeoutMs: 180_000,
  });
}

export type BoldSignDocumentProperties = {
  documentId: string;
  messageTitle?: string;
  status: 'InProgress' | 'Completed' | 'Declined' | 'Expired' | 'Revoked' | 'Draft' | 'Scheduled' | string;
  createdDate?: number;
  activityDate?: number;
  activityAction?: string;
  signerDetails?: Array<{
    signerName?: string;
    signerEmail?: string;
    status?: 'None' | 'NotCompleted' | 'Completed' | 'Declined' | 'Revoked' | 'Expired' | string;
    isViewed?: boolean;
    order?: number;
  }>;
  documentHistory?: Array<{ action?: string; timestamp?: number; email?: string }>;
};

export async function boldSignDocumentProperties(documentId: string): Promise<BoldSignDocumentProperties> {
  return request<BoldSignDocumentProperties>('GET', '/v1/document/properties', { params: { documentId } });
}

/** The document PDF (the signed copy once completed). */
export async function boldSignDownload(documentId: string): Promise<Buffer> {
  const data = await request<ArrayBuffer>('GET', '/v1/document/download', { params: { documentId }, binary: true, timeoutMs: 120_000 });
  return Buffer.from(data);
}

/** Void ("revoke") a document out for signature. */
export async function boldSignRevoke(documentId: string, message = 'Voided from the Cashable CRM.'): Promise<void> {
  await request('POST', '/v1/document/revoke', { params: { documentId }, data: { message } });
}

const isoFromEpoch = (s?: number | null) => (s && Number.isFinite(s) ? new Date(s * 1000).toISOString() : null);

/**
 * BoldSign document → the CRM's envelope status vocabulary (the one PearSign uses):
 * draft · sent · viewed · partially_signed · completed · declined · voided · expired.
 */
export function boldSignStatus(p: BoldSignDocumentProperties): string {
  const s = String(p.status || '').toLowerCase();
  if (s === 'completed') return 'completed';
  if (s === 'revoked') return 'voided';
  if (s === 'declined') return 'declined';
  if (s === 'expired') return 'expired';
  if (s === 'draft' || s === 'scheduled') return 'draft';
  const signers = p.signerDetails ?? [];
  if (signers.some((x) => String(x.status).toLowerCase() === 'completed')) return 'partially_signed';
  if (signers.some((x) => x.isViewed)) return 'viewed';
  return 'sent';
}

/** BoldSign properties in the PearSign envelope shape the CRM's sync already understands. */
export async function boldSignEnvelopeDetails(envelopeId: string): Promise<PearSignEnvelopeDetails> {
  const p = await boldSignDocumentProperties(boldSignDocumentId(envelopeId));
  const status = boldSignStatus(p);
  return {
    envelopeId,
    title: p.messageTitle || '',
    status,
    createdAt: isoFromEpoch(p.createdDate) ?? new Date().toISOString(),
    completedAt: status === 'completed' ? isoFromEpoch(p.activityDate) : null,
    recipients: (p.signerDetails ?? []).map((x) => {
      const st = String(x.status || '').toLowerCase();
      return {
        signerEmail: String(x.signerEmail || ''),
        signerName: String(x.signerName || ''),
        status: st === 'completed' ? 'signed' : st === 'declined' ? 'declined' : x.isViewed ? 'viewed' : 'sent',
        signedAt: st === 'completed' ? isoFromEpoch(p.activityDate) : null,
      };
    }),
  };
}
