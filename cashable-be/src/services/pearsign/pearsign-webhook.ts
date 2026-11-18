import crypto from 'crypto';
import express, { type Request, type Response } from 'express';
import { findContractIdByPearSignEnvelopeId, syncPearSignContract } from './pearsign-contract.service';

/**
 * PearSign webhook receiver — PUBLIC (no JWT), mounted at /api/v1/pearsign/webhook
 * BEFORE the authenticated PearSign router. Register this URL in
 * PearSign → Settings → Webhooks: {PEARSIGN_WEBHOOK_URL}
 *
 * Signature (as actually delivered — verified against real PearSign deliveries in Meridian):
 *   X-PearSign-Signature: <hex HMAC-SHA256(PEARSIGN_WEBHOOK_SECRET, rawBody)>
 * There is NO timestamp header. For safety we also accept an optional `sha256=` prefix and,
 * if PearSign ever adds X-PearSign-Timestamp, the `${timestamp}.${rawBody}` variant.
 *
 * The payload only tells us *which* envelope changed; status is then refreshed through
 * syncPearSignContract (same path as the polling job), so the CRM never trusts payload fields.
 */
function verifySignature(req: Request): { ok: boolean; reason?: string } {
  const secret = process.env.PEARSIGN_WEBHOOK_SECRET?.trim();
  if (!secret) return { ok: false, reason: 'PEARSIGN_WEBHOOK_SECRET is not set' };

  const header = String(req.header('x-pearsign-signature') || '').trim();
  const timestamp = String(req.header('x-pearsign-timestamp') || '').trim();
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!header) return { ok: false, reason: 'missing X-PearSign-Signature header' };
  if (!rawBody) return { ok: false, reason: 'missing raw body' };

  const given = header.replace(/^sha256=/i, '').trim().toLowerCase();
  const messages: Buffer[] = [rawBody];
  if (timestamp) messages.push(Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]));
  const keys = [secret];
  if (secret.startsWith('whsec_')) keys.push(secret.slice(6));

  for (const key of keys) {
    for (const msg of messages) {
      const expected = crypto.createHmac('sha256', key).update(msg).digest('hex');
      if (expected.length === given.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
        return { ok: true };
      }
    }
  }
  return { ok: false, reason: 'signature mismatch (check PEARSIGN_WEBHOOK_SECRET matches this webhook in PearSign)' };
}

/** Envelope id from the (loosely documented) payload shapes PearSign may send. */
function envelopeIdFrom(body: any): string | null {
  const d = body?.data ?? {};
  const id =
    d.envelopeId ?? d.envelope_id ?? d.envelope?.id ?? d.envelope?.envelopeId ?? body?.envelopeId ?? body?.envelope_id;
  return id ? String(id) : null;
}

async function handlePearSignWebhook(req: Request, res: Response): Promise<void> {
  const event = String(req.header('x-pearsign-event') || req.body?.event || 'unknown');
  const check = verifySignature(req);
  if (!check.ok) {
    console.warn(`[PearSign webhook] rejected ${event}: ${check.reason}`);
    res.status(401).json({ success: false, message: 'Invalid webhook signature' });
    return;
  }

  // Acknowledge fast; PearSign retries on slow/failed responses.
  res.status(200).json({ success: true, received: event });

  if (event === 'test') {
    console.log('[PearSign webhook] test event received — webhook is connected.');
    return;
  }

  const envelopeId = envelopeIdFrom(req.body);
  if (!envelopeId) {
    console.warn(`[PearSign webhook] ${event}: no envelope id in payload`, JSON.stringify(req.body).slice(0, 500));
    return;
  }

  try {
    const contractId = await findContractIdByPearSignEnvelopeId(envelopeId);
    if (!contractId) {
      console.warn(`[PearSign webhook] ${event}: no contract for envelope ${envelopeId}`);
      return;
    }
    const { changed, state } = await syncPearSignContract(contractId);
    console.log(
      `[PearSign webhook] ${event} envelope ${envelopeId} → contract ${contractId}` +
        (changed ? ` now ${state?.status}` : ' (no change)'),
    );
  } catch (err) {
    console.error(`[PearSign webhook] ${event} envelope ${envelopeId} sync failed:`, (err as Error)?.message);
  }
}

const router = express.Router();
router.post('/', (req, res) => void handlePearSignWebhook(req, res));
router.get('/', (_req, res) => {
  res.status(200).json({ success: true, message: 'PearSign webhook is live' });
});

export default router;
