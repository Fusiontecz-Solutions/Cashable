import { isPearSignConfigured } from '../services/pearsign/pearsign-client';
import { isBoldSignConfigured } from '../services/pearsign/boldsign-client';
import { listActivePearSignContractIds, syncPearSignContract } from '../services/pearsign/pearsign-contract.service';

/**
 * Polls PearSign for contracts still out for signature so a deal moves to Contract
 * Signed (and the signed PDF is archived) without anyone opening it. PearSign's
 * public webhooks are Zapier-style subscriptions; polling keeps this independent of
 * a publicly reachable callback URL (same approach as Meridian).
 *
 * Env: PEARSIGN_STATUS_POLL_MS (default 5 min), PEARSIGN_STATUS_POLL_DISABLED=true to turn off.
 */
const INTERVAL_MS = Number(process.env.PEARSIGN_STATUS_POLL_MS || 5 * 60_000);
let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const ids = await listActivePearSignContractIds();
    for (const id of ids) {
      try {
        const { changed, state } = await syncPearSignContract(id);
        if (changed) console.log(`[PearSign] contract ${id} → ${state?.status}`);
      } catch (err) {
        console.warn(`[PearSign] status sync failed for contract ${id}:`, (err as Error)?.message);
      }
    }
  } catch (err) {
    console.warn('[PearSign] status job failed:', (err as Error)?.message);
  } finally {
    running = false;
  }
}

export function startPearSignContractStatusJob() {
  // Polls PearSign and BoldSign contracts alike (bs- ids are routed to BoldSign).
  if (timer || !(isPearSignConfigured() || isBoldSignConfigured()) || process.env.PEARSIGN_STATUS_POLL_DISABLED === 'true') return;
  timer = setInterval(() => void tick(), INTERVAL_MS);
  timer.unref?.();
  setTimeout(() => void tick(), 30_000).unref?.();
}
