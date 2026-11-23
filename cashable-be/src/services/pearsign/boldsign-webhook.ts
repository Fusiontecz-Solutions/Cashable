import crypto from 'crypto';
import express, { type Request, type Response } from 'express';
import { boldSignDetailsFromPayload, toBoldSignEnvelopeId } from './boldsign-client';
import { findContractIdByPearSignEnvelopeId, syncPearSignContract } from './pearsign-contract.service';
import { recoverBoldSignEditorSend } from './pearsign-package.service';

/**
 * BoldSign webhook receiver — PUBLIC (no JWT), mounted at /api/v1/boldsign/webhook.
 * Register this URL in BoldSign → API → Webhooks (document events).
 *
 * With BOLDSIGN_WEBHOOK_SECRET set, a correctly signed payload's document status is used directly
 * (no BoldSign API call — the account allows few calls an hour). Without a secret (or if the payload
 * has no status) the CRM re-reads the document from BoldSign instead, so a forged call can never
 * set a status. Signature:
 *   X-BoldSign-Signature: t=<unix seconds>, s0=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>
 */
/** `verified`: the signature matched, so the payload's document status can be used as-is. */
function verifySignature(req: Request): { ok: boolean; verified?: boolean; reason?: string } {
  const secret = process.env.BOLDSIGN_WEBHOOK_SECRET?.trim();
  if (!secret) return { ok: true, verified: false }; // payload not trusted: the CRM re-reads BoldSign
  const header = String(req.header('x-boldsign-signature') || '').trim();
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!header) return { ok: false, reason: 'missing X-BoldSign-Signature header' };
  if (!rawBody) return { ok: false, reason: 'missing raw body' };
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const [k, ...v] = p.trim().split('=');
      return [k.trim(), v.join('=').trim()];
    }),
  );
  const t = parts.t || '';
  const given = [parts.s0, parts.s1].filter(Boolean).map((s) => s.toLowerCase());
  const messages = [t ? Buffer.concat([Buffer.from(`${t}.`), rawBody]) : null, rawBody].filter(Boolean) as Buffer[];
  for (const msg of messages) {
    const expected = crypto.createHmac('sha256', secret).update(msg).digest('hex');
    for (const g of given) {
      if (g.length === expected.length && crypto.timingSafeEqual(Buffer.from(g), Buffer.from(expected))) return { ok: true, verified: true };
    }
  }
  return { ok: false, reason: 'signature mismatch (check BOLDSIGN_WEBHOOK_SECRET matches this webhook in BoldSign)' };
}

function documentIdFrom(body: any): string | null {
  const d = body?.data ?? {};
  const id = d.documentId ?? d.document?.documentId ?? d.object?.documentId ?? body?.documentId;
  return id ? String(id) : null;
}

async function handleBoldSignWebhook(req: Request, res: Response): Promise<void> {
  const event = String(req.body?.event?.eventType || req.header('x-boldsign-event') || 'unknown');
  const check = verifySignature(req);
  if (!check.ok) {
    // An unverified event is never trusted: its status is ignored and, if it names one of our
    // documents, the CRM re-reads that document from BoldSign (throttled). So a wrong secret only
    // costs an API call, instead of the CRM missing "Completed" and its signed-copy email.
    console.warn(`[BoldSign webhook] ${event}: ${check.reason} — re-reading the document from BoldSign instead`);
    const documentId = documentIdFrom(req.body);
    if (!documentId) {
      res.status(401).json({ success: false, message: 'Invalid webhook signature' });
      return;
    }
  }
  // Acknowledge fast; BoldSign retries slow or failed deliveries.
  res.status(200).json({ success: true, received: event });
  if (/verification/i.test(event)) {
    console.log('[BoldSign webhook] verification event received — webhook is connected.');
    return;
  }
  const documentId = documentIdFrom(req.body);
  if (!documentId) {
    console.warn(`[BoldSign webhook] ${event}: no document id in payload`, JSON.stringify(req.body).slice(0, 500));
    return;
  }
  const envelopeId = toBoldSignEnvelopeId(documentId);
  try {
    let contractId = await findContractIdByPearSignEnvelopeId(envelopeId);
    if (!contractId) {
      // Sent from BoldSign's editor but never recorded by the CRM (tab closed early): the CRM
      // tags every document with its contract — record it now (checked against BoldSign).
      const tagged = Number(req.body?.data?.metaData?.contractId ?? req.body?.data?.document?.metaData?.contractId);
      if (Number.isFinite(tagged) && tagged > 0) {
        const out = await recoverBoldSignEditorSend(tagged, envelopeId).catch((err) => {
          console.warn(`[BoldSign webhook] ${event}: could not record document ${documentId} on contract ${tagged}:`, (err as Error)?.message);
          return null;
        });
        if (out?.status === 'sent') {
          console.log(`[BoldSign webhook] recorded editor send ${documentId} on contract ${tagged}`);
          contractId = tagged;
        }
      }
    }
    if (!contractId) {
      console.warn(`[BoldSign webhook] ${event}: no contract for document ${documentId}`);
      return;
    }
    // A verified payload carries the document's status: use it (no BoldSign API call).
    const details = check.verified ? boldSignDetailsFromPayload(envelopeId, req.body?.data) : null;
    const { changed, state } = await syncPearSignContract(contractId, details ? { details } : {});
    console.log(`[BoldSign webhook] ${event} ${documentId} → contract ${contractId}${changed ? ` now ${state?.status}` : ' (no change)'}`);
  } catch (err) {
    console.error(`[BoldSign webhook] ${event} ${documentId} sync failed:`, (err as Error)?.message);
  }
}

const router = express.Router();
router.post('/', (req, res) => void handleBoldSignWebhook(req, res));
router.get('/', (_req, res) => {
  res.status(200).json({ success: true, message: 'BoldSign webhook is live' });
});

export default router;
