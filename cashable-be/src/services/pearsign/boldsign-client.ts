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

/**
 * BoldSign's hourly API allowance, as its responses report it (X-RateLimit-* headers).
 * Background work (status job, recovery checks) stops while the allowance is low so what is left
 * goes to people opening, sending and voiding contracts; after a 429 nothing calls BoldSign until
 * the allowance resets.
 */
const rate = { limit: null as number | null, remaining: null as number | null, resetAt: 0, blockedUntil: 0 };

function header(headers: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const raw = headers[name] ?? headers[name.toLowerCase()];
    const v = String((Array.isArray(raw) ? raw[0] : raw) ?? '').trim();
    if (v) return v;
  }
  return '';
}

function headerNumber(headers: Record<string, unknown>, ...names: string[]): number | null {
  const v = header(headers, ...names);
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** A reset time: an ISO date (what BoldSign sends), epoch seconds, or seconds from now. */
function resetMs(value: string): number {
  if (!value) return 0;
  const n = Number(value);
  if (Number.isFinite(n)) return n <= 0 ? 0 : n > 1e9 ? n * 1000 : Date.now() + n * 1000;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

/** BoldSign's allowance per window (its limit header is the window, e.g. "1h"). */
const BOLDSIGN_HOURLY_LIMIT = Number(process.env.BOLDSIGN_HOURLY_LIMIT) || 50;

function noteRateHeaders(headers: Record<string, unknown>, status: number) {
  // BoldSign: x-rate-limit-limit "1h", x-rate-limit-remaining "49", x-rate-limit-reset ISO date.
  const limit = headerNumber(headers, 'x-rate-limit-limit', 'x-ratelimit-limit');
  const remaining = headerNumber(headers, 'x-rate-limit-remaining', 'x-ratelimit-remaining');
  const reset = resetMs(header(headers, 'x-rate-limit-reset', 'x-ratelimit-reset'));
  rate.limit = limit ?? BOLDSIGN_HOURLY_LIMIT;
  if (remaining != null) rate.remaining = remaining;
  if (reset) rate.resetAt = reset;
  if (status === 429) {
    const retry = resetMs(header(headers, 'retry-after'));
    rate.remaining = 0;
    rate.blockedUntil = Math.max(retry, reset, Date.now() + 60_000);
  }
}

/** True when background work may spend a BoldSign call (keeps a reserve for people using the CRM). */
export function boldSignBackgroundAllowed(): boolean {
  const now = Date.now();
  if (now < rate.blockedUntil) return false;
  if (rate.resetAt && now >= rate.resetAt) return true; // the allowance has reset since we last heard
  if (rate.remaining == null) return true;
  // Keep 40% of the hourly allowance (20 of 50) for people opening, sending and voiding.
  const reserve = Math.max(10, Math.round((rate.limit ?? BOLDSIGN_HOURLY_LIMIT) * 0.4));
  return rate.remaining > reserve;
}

/** For logs: what BoldSign last reported about the hourly allowance. */
export function boldSignRateStatus() {
  return { ...rate };
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts: { data?: unknown; params?: Record<string, unknown>; binary?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const key = apiKey();
  if (!key) throw new PearSignApiError('BOLDSIGN_API_KEY is not set in .env', 0);
  if (Date.now() < rate.blockedUntil) {
    // Already over the limit: don't spend another call finding that out.
    throw new PearSignApiError(
      "BoldSign's hourly API limit for this account is used up. Wait a few minutes and try again (BoldSign resets it within the hour).",
      429,
    );
  }
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
  noteRateHeaders((res.headers ?? {}) as Record<string, unknown>, res.status);
  if (res.status >= 200 && res.status < 300) return res.data as T;
  let body: unknown = res.data;
  if (opts.binary && body) {
    try {
      body = JSON.parse(Buffer.from(body as ArrayBuffer).toString('utf8'));
    } catch {
      /* not JSON */
    }
  }
  if (res.status === 429) {
    console.warn(`[BoldSign] ${method} ${path} → 429 (hourly API limit reached)`);
    throw new PearSignApiError(
      "BoldSign's hourly API limit for this account is used up. Wait a few minutes and try again (BoldSign resets it within the hour).",
      429,
      body,
    );
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
  signerType?: 'Signer' | 'Reviewer';
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
  /** Name BoldSign shows for the PDF (instead of "document-1.pdf"). */
  fileName?: string;
  /** CC recipients: BoldSign copies them on the document's emails (never signers or reviewers). */
  cc?: string[];
};

/** Unique, valid CC emails that are not also signers. */
export function boldSignCcList(cc: string[] | undefined, signers: Array<{ emailAddress: string }>): Array<{ emailAddress: string }> {
  const taken = new Set(signers.map((s) => String(s.emailAddress || '').trim().toLowerCase()));
  const out: Array<{ emailAddress: string }> = [];
  for (const raw of cc ?? []) {
    const e = String(raw || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || taken.has(e)) continue;
    taken.add(e);
    out.push({ emailAddress: e });
  }
  return out;
}

function sendBody(input: BoldSignSendInput) {
  const brandId = String(process.env.BOLDSIGN_BRAND_ID || '').trim();
  return {
    title: input.title.slice(0, 256),
    message: (input.message || '').slice(0, 5000),
    files: input.pdfBase64.map((b64, i) => {
      const base64 = `data:application/pdf;base64,${b64}`;
      const name = i === 0 ? String(input.fileName || '').trim() : '';
      return name ? { base64, fileName: name.slice(0, 200) } : base64;
    }),
    signers: input.signers.map((s) => ({ signerType: 'Signer', ...s })),
    ...(() => {
      const cc = boldSignCcList(input.cc, input.signers);
      return cc.length ? { cc } : {};
    })(),
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
/** Set once BoldSign refuses the embedded editor for this account's plan (until the server restarts). */
let embeddedRefusedByPlan = false;

/**
 * Whether BoldSign's embedded editor (prepare page) can be used. Off with BOLDSIGN_EMBEDDED=false,
 * or after the plan refused it — the CRM then reviews in its own screen and sends directly.
 */
export function boldSignEmbeddedAvailable(): boolean {
  return String(process.env.BOLDSIGN_EMBEDDED ?? '').trim().toLowerCase() !== 'false' && !embeddedRefusedByPlan;
}

export const isBoldSignPlanRefusal = (err: unknown) => /does not provide access|not available (in|on) your plan|upgrade your plan/i.test(String((err as Error)?.message ?? ''));

export async function boldSignCreateEmbeddedSend(
  input: BoldSignSendInput & { redirectUrl?: string; linkValidTill?: Date },
): Promise<{ documentId: string; sendUrl: string }> {
  try {
    return await createEmbeddedSend(input);
  } catch (err) {
    if (isBoldSignPlanRefusal(err)) embeddedRefusedByPlan = true;
    throw err;
  }
}

function createEmbeddedSend(input: BoldSignSendInput & { redirectUrl?: string; linkValidTill?: Date }) {
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
  /** Set by the CRM on every send: { contractId, source: 'cashable-crm' }. */
  metaData?: Record<string, string> | null;
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

/** One page of the account's documents (newest activity first). */
export async function boldSignListDocuments(page: number, pageSize = 100): Promise<{
  result?: BoldSignDocumentProperties[];
  pageDetails?: { totalPages?: number };
}> {
  return request('GET', '/v1/document/list', { params: { Page: page, PageSize: pageSize } });
}

/** A send, a sync and a recovery check often read the same document within seconds. */
const propertiesCache = new Map<string, { at: number; props: BoldSignDocumentProperties }>();
const PROPERTIES_CACHE_MS = 20_000;

export async function boldSignDocumentProperties(documentId: string): Promise<BoldSignDocumentProperties> {
  const hit = propertiesCache.get(documentId);
  if (hit && Date.now() - hit.at < PROPERTIES_CACHE_MS) return hit.props;
  const props = await request<BoldSignDocumentProperties>('GET', '/v1/document/properties', { params: { documentId } });
  for (const [k, v] of propertiesCache) if (Date.now() - v.at >= PROPERTIES_CACHE_MS) propertiesCache.delete(k);
  // A draft is about to change (the editor's Send) — always read it fresh.
  if (!/^(draft|scheduled)$/i.test(String(props.status || ''))) propertiesCache.set(documentId, { at: Date.now(), props });
  return props;
}

/** Recent downloads: the archive, the Signed email and a download often want the same PDF at once. */
const downloadCache = new Map<string, { at: number; buf: Buffer }>();
const DOWNLOAD_CACHE_MS = 10 * 60_000;

/** The document PDF (the signed copy once completed). */
export async function boldSignDownload(documentId: string): Promise<Buffer> {
  const hit = downloadCache.get(documentId);
  if (hit && Date.now() - hit.at < DOWNLOAD_CACHE_MS) return hit.buf;
  const data = await request<ArrayBuffer>('GET', '/v1/document/download', { params: { documentId }, binary: true, timeoutMs: 120_000 });
  const buf = Buffer.from(data);
  for (const [k, v] of downloadCache) if (Date.now() - v.at >= DOWNLOAD_CACHE_MS) downloadCache.delete(k);
  downloadCache.set(documentId, { at: Date.now(), buf });
  return buf;
}

/** Void ("revoke") a document out for signature. */
export async function boldSignRevoke(documentId: string, message = 'Voided from the Cashable CRM.'): Promise<void> {
  await request('POST', '/v1/document/revoke', { params: { documentId }, data: { message } });
  propertiesCache.delete(documentId);
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
  return boldSignDetailsFrom(envelopeId, await boldSignDocumentProperties(boldSignDocumentId(envelopeId)));
}

/**
 * Same mapping from a document object BoldSign already gave us (a verified webhook payload carries
 * one), so a status update costs no API call. Null when the object has no status.
 */
export function boldSignDetailsFromPayload(envelopeId: string, data: unknown): PearSignEnvelopeDetails | null {
  const p = data as BoldSignDocumentProperties | null;
  if (!p || typeof p !== 'object' || !p.status) return null;
  return boldSignDetailsFrom(envelopeId, p);
}

function boldSignDetailsFrom(envelopeId: string, p: BoldSignDocumentProperties): PearSignEnvelopeDetails {
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

/** Drop a cached download (a document just completed: the next download must be the signed copy). */
export function forgetBoldSignDownload(envelopeId: string): void {
  downloadCache.delete(boldSignDocumentId(envelopeId));
}
