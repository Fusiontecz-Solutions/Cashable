import axios from '../../types/http';

/**
 * Thin client for the PearSign REST API (https://pearsign.com/api/v1).
 *
 * Phase 1: PearSign hosts the MAIN contract templates (one per funder × owner
 * count). Addendums, ACH and state disclosures still go through Dropbox Sign.
 *
 * Auth: `Authorization: Bearer ps_live_…`. The key must stay server-side.
 */

export const PEARSIGN_API_BASE = (
  process.env.PEARSIGN_API_BASE_URL || 'https://pearsign.com/api/v1'
).replace(/\/$/, '');

function apiKey(): string {
  return String(process.env.PEARSIGN_API_KEY || '').trim();
}

export function isPearSignConfigured(): boolean {
  return apiKey().length > 0;
}

/**
 * PearSign envelope ids are `env-<uuid>`. Dropbox Sign ids are plain hex and
 * DocuSign ids are bare dashed GUIDs, so the `env-` prefix is what tells them apart.
 */
export function looksLikePearSignEnvelopeId(id?: string | null): boolean {
  return /^env-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id ?? '').trim());
}

export class PearSignApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'PearSignApiError';
  }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts: { data?: unknown; params?: Record<string, unknown>; binary?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const key = apiKey();
  if (!key) throw new PearSignApiError('PEARSIGN_API_KEY is not set in .env', 0);

  const started = Date.now();
  const res = await axios.request({
    method,
    url: `${PEARSIGN_API_BASE}${path}`,
    data: opts.data,
    params: opts.params,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(opts.data !== undefined ? { 'Content-Type': 'application/json' } : {}),
      Accept: opts.binary ? 'application/pdf' : 'application/json',
    },
    responseType: opts.binary ? 'arraybuffer' : 'json',
    timeout: opts.timeoutMs ?? 60_000,
    maxBodyLength: 50 * 1024 * 1024,
    maxContentLength: 50 * 1024 * 1024,
    validateStatus: () => true,
  });

  if (res.status >= 200 && res.status < 300) {
    if (process.env.PEARSIGN_DEBUG === 'true') {
      console.info(`[PearSign] ${method} ${path} → ${res.status} (${Date.now() - started}ms)`);
    }
    return res.data as T;
  }

  let body: unknown = res.data;
  if (opts.binary && body) {
    try {
      body = JSON.parse(Buffer.from(body as ArrayBuffer).toString('utf8'));
    } catch {
      /* not JSON */
    }
  }
  // PearSign errors come as `{ error: { code, message, details } }` or `{ error, message }`.
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, any>;
  const details = Array.isArray(b.error?.details)
    ? b.error.details.map((d: any) => `${d.path}: ${d.message}`).join('; ')
    : '';
  const msg =
    (typeof b.error === 'object' && b.error?.message) ||
    (typeof b.message === 'string' && b.message) ||
    (typeof b.error === 'string' && b.error) ||
    `HTTP ${res.status}`;
  console.warn(`[PearSign] ${method} ${path} → ${res.status}: ${msg}${details ? ` (${details})` : ''}`);
  throw new PearSignApiError(
    `PearSign ${method} ${path} failed: ${msg}${details ? ` (${details})` : ''}`,
    res.status,
    body,
  );
}

// ---------- Types (subset of /api/v1/openapi.json + observed create schema) ----------

export type PearSignSignerRole = { roleId: string; name: string; order: number };

export type PearSignFieldType =
  | 'text'
  | 'email'
  | 'date'
  | 'signature'
  | 'initials'
  | 'company'
  | 'address'
  | 'phone'
  | 'number'
  | 'checkbox'
  | 'upload';

export type PearSignFieldPosition = { page: number; x: number; y: number; width: number; height: number };

/**
 * Text formatting on fields that show text (not signature / initials). All optional;
 * a field without them uses PearSign's auto-fit. fontSize is 6–36pt, fontColor `#rrggbb`.
 * PearSign rejects a box too short for its font size (see pearSignHeightForFont).
 */
export type PearSignFieldFormatting = {
  fontFamily?: 'helvetica' | 'times' | 'courier';
  fontSize?: number;
  fontColor?: string;
};

export type PearSignTemplateField = PearSignFieldFormatting & {
  fieldId: string;
  fieldName: string;
  type: string;
  required: boolean;
  roleId: string;
  roleName?: string;
  /** PDF points, top-left origin. */
  position?: Partial<PearSignFieldPosition>;
};

export type PearSignTemplate = {
  id: string;
  name: string;
  status: string;
  description?: string | null;
  category?: string | null;
  signerRoles: PearSignSignerRole[];
  fields?: PearSignTemplateField[];
  fieldCount?: number;
  hasDocument?: boolean;
};

/** Body accepted by POST /templates (validated against the live API). */
export type PearSignTemplateCreateInput = {
  name: string;
  description?: string;
  category?: string;
  status?: 'draft' | 'active';
  signerRoles: Array<{ roleId: string; name: string; order: number }>;
  /**
   * Position MUST be the nested `position` object: the API also accepts flat
   * page/x/y/width/height keys but silently ignores them (fields get stacked at
   * default spots on page 1). PDF points, top-left origin.
   */
  fields: Array<
    PearSignFieldFormatting & {
      fieldName: string;
      type: PearSignFieldType;
      required: boolean;
      roleId: string;
      position: PearSignFieldPosition;
      placeholder?: string;
    }
  >;
  documentBase64: string;
};

export type PearSignRecipientInput = {
  email: string;
  name: string;
  roleId: string;
};

export type PearSignSendInput = {
  templateId: string;
  recipients: PearSignRecipientInput[];
  /** Keyed by fieldId or fieldName. */
  fieldValues?: Record<string, string | number | boolean>;
  sender?: { name: string; email?: string };
  options?: {
    title?: string;
    message?: string;
    expirationDays?: number;
    sendEmail?: boolean;
    /** Send again on purpose to a signer who completed this document within 60 days. */
    allowRepeat?: boolean;
  };
};

export type PearSignSendResult = {
  envelopeId: string;
  title: string;
  status: string;
  templateId: string;
  recipients: Array<{ email: string; name: string; roleId: string; status: string }>;
  fieldCount?: number;
  prefilledFieldCount?: number;
  signingUrls?: Array<{ email: string; name: string; roleId: string; signingUrl: string }>;
  emailSent?: boolean;
  createdAt?: string;
};

export type PearSignEnvelopeDetails = {
  envelopeId: string;
  title: string;
  status: string;
  sentAt?: string | null;
  viewedAt?: string | null;
  signedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  recipients: Array<{
    signerEmail: string;
    signerName: string;
    status: string;
    signedAt?: string | null;
  }>;
};

// ---------- Templates ----------

export async function listPearSignTemplates(): Promise<PearSignTemplate[]> {
  const res = await request<{ data: PearSignTemplate[] }>('GET', '/templates', { params: { limit: 100 } });
  return res.data ?? [];
}

export async function getPearSignTemplate(templateId: string): Promise<PearSignTemplate> {
  const res = await request<{ data: PearSignTemplate }>('GET', `/templates/${encodeURIComponent(templateId)}`);
  return res.data;
}

export async function createPearSignTemplate(input: PearSignTemplateCreateInput): Promise<PearSignTemplate> {
  const res = await request<{ data?: PearSignTemplate } & Partial<PearSignTemplate>>('POST', '/templates', {
    data: input,
    timeoutMs: 180_000,
  });
  return (res.data ?? res) as PearSignTemplate;
}

export async function updatePearSignTemplate(
  templateId: string,
  patch: Partial<PearSignTemplateCreateInput>,
): Promise<PearSignTemplate> {
  const res = await request<{ data?: PearSignTemplate } & Partial<PearSignTemplate>>(
    'PATCH',
    `/templates/${encodeURIComponent(templateId)}`,
    { data: patch, timeoutMs: 180_000 },
  );
  return (res.data ?? res) as PearSignTemplate;
}

export async function deletePearSignTemplate(templateId: string): Promise<void> {
  await request('DELETE', `/templates/${encodeURIComponent(templateId)}`);
}

// ---------- Envelopes ----------

export async function sendPearSignEnvelope(input: PearSignSendInput): Promise<PearSignSendResult> {
  const res = await request<{ success?: boolean; data: PearSignSendResult }>('POST', '/envelopes/send', {
    data: input,
  });
  return res.data;
}

export async function getPearSignEnvelope(envelopeId: string): Promise<PearSignEnvelopeDetails> {
  const res = await request<{ data?: PearSignEnvelopeDetails } & Partial<PearSignEnvelopeDetails>>(
    'GET',
    `/envelopes/${encodeURIComponent(envelopeId)}`,
  );
  return (res.data ?? res) as PearSignEnvelopeDetails;
}

export async function voidPearSignEnvelope(envelopeId: string): Promise<void> {
  await request('DELETE', `/envelopes/${encodeURIComponent(envelopeId)}`);
}

/** Raw PDF bytes (`latest` = signed copy once complete). */
export async function downloadPearSignEnvelopePdf(
  envelopeId: string,
  version: 'latest' | 'original' = 'latest',
): Promise<Buffer> {
  const data = await request<ArrayBuffer>('GET', `/envelopes/${encodeURIComponent(envelopeId)}/download`, {
    params: { version },
    binary: true,
  });
  return Buffer.from(data);
}

// ---------- Embedded editor ----------

export type PearSignEditorField = PearSignFieldFormatting & {
  fieldId?: string;
  fieldName: string;
  type: string;
  required?: boolean;
  roleId?: string;
  position?: Partial<PearSignFieldPosition>;
  prefillValue?: string | number | boolean | null;
  readOnly?: boolean;
  textAlign?: string;
};

/** POST /editor-sessions (embedded): an editor the CRM frames in its own page. */
export type PearSignEditorSessionInput = {
  documentBase64: string;
  fields: PearSignTemplateCreateInput['fields'];
  signerRoles: Array<{ roleId: string; name: string; order: number }>;
  fieldValues?: Record<string, string | number | boolean>;
  recipients: PearSignRecipientInput[];
  /** send: the editor's Send creates the envelope. */
  mode: 'send' | 'return';
  /** Origins only (https; http only for localhost). */
  allowedOrigins: string[];
  sender?: { name?: string; email?: string };
  options?: {
    title?: string;
    message?: string;
    expirationDays?: number;
    allowAddFields?: boolean;
    allowDeleteFields?: boolean;
    defaultFontSize?: number;
    /** mode send: the editor's Send may repeat a document a signer completed within 60 days. */
    allowRepeat?: boolean;
  };
  metadata?: Record<string, string | number | boolean>;
  expiresInSeconds?: number;
};

export type PearSignEditorSession = {
  sessionId: string;
  /** open | completing | completed | cancelled | expired */
  status?: string;
  mode?: string;
  editorUrl?: string;
  expiresAt?: string;
  templateId?: string | null;
  envelopeId?: string | null;
  /** 'incomplete' / 'unknown' when PearSign's send step did not finish cleanly. */
  delivery?: string | null;
  metadata?: Record<string, unknown> | null;
  fields?: PearSignEditorField[];
};

export async function createPearSignEditorSession(input: PearSignEditorSessionInput): Promise<PearSignEditorSession> {
  const res = await request<{ data?: PearSignEditorSession } & Partial<PearSignEditorSession>>('POST', '/editor-sessions', {
    data: input,
    timeoutMs: 180_000,
  });
  return (res.data ?? res) as PearSignEditorSession;
}

export async function getPearSignEditorSession(sessionId: string): Promise<PearSignEditorSession> {
  const res = await request<{ data?: PearSignEditorSession } & Partial<PearSignEditorSession>>(
    'GET',
    `/editor-sessions/${encodeURIComponent(sessionId)}`,
  );
  return (res.data ?? res) as PearSignEditorSession;
}
