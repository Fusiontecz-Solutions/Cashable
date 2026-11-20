import crypto from 'crypto';
import express, { type Request, type Response } from 'express';
import { toBoldSignEnvelopeId } from './boldsign-client';
import { findContractIdByPearSignEnvelopeId, syncPearSignContract } from './pearsign-contract.service';

/**
 * BoldSign webhook receiver — PUBLIC (no JWT), mounted at /api/v1/boldsign/webhook.
 * Register this URL in BoldSign → API → Webhooks (document events).
 *
 * The payload only says *which* document changed; the CRM then re-reads the document from
 * BoldSign (syncPearSignContract, same path as the 5-minute status job), so a forged call can
 * never set a status. When BOLDSIGN_WEBHOOK_SECRET is set, the signature is also checked:
 *   X-BoldSign-Signature: t=<unix seconds>, s0=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>
 */
function verifySignature(req: Request): { ok: boolean; reason?: string } {
  const secret = process.env.BOLDSIGN_WEBHOOK_SECRET?.trim();
  if (!secret) return { ok: true }; // payload is never trusted; see above
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
      if (g.length === expected.length && crypto.timingSafeEqual(Buffer.from(g), Buffer.from(expected))) return { ok: true };
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
    console.warn(`[BoldSign webhook] rejected ${event}: ${check.reason}`);
    res.status(401).json({ success: false, message: 'Invalid webhook signature' });
    return;
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
    const contractId = await findContractIdByPearSignEnvelopeId(envelopeId);
    if (!contractId) {
      console.warn(`[BoldSign webhook] ${event}: no contract for document ${documentId}`);
      return;
    }
    const { changed, state } = await syncPearSignContract(contractId);
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
