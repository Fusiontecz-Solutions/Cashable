import { isPearSignConfigured } from '../services/pearsign/pearsign-client';
import { boldSignBackgroundAllowed, boldSignRateStatus, isBoldSignConfigured } from '../services/pearsign/boldsign-client';
import { listActivePearSignContractIds, syncPearSignContract } from '../services/pearsign/pearsign-contract.service';
import {
  backfillBoldSignDocumentChain,
  listPendingBoldSignEditorSessions,
  markBoldSignEditorSessionChecked,
  recoverBoldSignEditorSend,
} from '../services/pearsign/pearsign-package.service';

/**
 * Polls PearSign / BoldSign for contracts still out for signature so a deal moves to Contract
 * Signed (and the signed PDF is archived) without anyone opening it. BoldSign also pushes changes
 * by webhook, so for BoldSign this is a slow safety net that never spends the hourly API allowance
 * people need (it stops while the allowance is low).
 *
 * Env: PEARSIGN_STATUS_POLL_MS (default 5 min), PEARSIGN_STATUS_POLL_DISABLED=true to turn off,
 * BOLDSIGN_CHAIN_BACKFILL=true to re-run the one-time document-chain catch-up at start.
 */
const INTERVAL_MS = Number(process.env.PEARSIGN_STATUS_POLL_MS || 5 * 60_000);
let timer: NodeJS.Timeout | null = null;
let running = false;

function boldSignBudgetLow(): boolean {
  if (!isBoldSignConfigured() || boldSignBackgroundAllowed()) return false;
  const r = boldSignRateStatus();
  console.warn(`[BoldSign] status job paused: hourly API allowance low (remaining ${r.remaining ?? '?'} of ${r.limit ?? '?'})`);
  return true;
}

async function tick() {
  if (running) return;
  running = true;
  try {
    // BoldSign editors opened but never recorded as sent (tab closed before it told the CRM):
    // record the ones BoldSign has sent. Unsent drafts are re-checked less and less often.
    // Off by default: BoldSign's webhook reports an editor send (the CRM finds the contract from the
    // document's metadata), so drafts are not checked with API calls. BOLDSIGN_STATUS_API=true restores it.
    if (isBoldSignConfigured() && process.env.BOLDSIGN_STATUS_API === 'true') {
      for (const { contractId, envelopeId } of await listPendingBoldSignEditorSessions().catch(() => [])) {
        if (boldSignBudgetLow()) break;
        try {
          const out = await recoverBoldSignEditorSend(contractId, envelopeId);
          if (out.status === 'sent' && !('alreadyRecorded' in out && out.alreadyRecorded)) {
            console.log(`[BoldSign] recorded editor send ${envelopeId} on contract ${contractId}`);
          } else if (out.status === 'open') {
            await markBoldSignEditorSessionChecked(contractId, envelopeId);
          }
        } catch (err) {
          console.warn(`[BoldSign] editor send check failed for contract ${contractId}:`, (err as Error)?.message);
          await markBoldSignEditorSessionChecked(contractId, envelopeId).catch(() => undefined);
        }
      }
    }
    const ids = await listActivePearSignContractIds();
    for (const id of ids) {
      if (boldSignBudgetLow()) break;
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
  // The document-chain catch-up already ran; it lists every BoldSign document, so it no longer
  // runs on every deploy — only when BOLDSIGN_CHAIN_BACKFILL=true.
  if (isBoldSignConfigured() && process.env.BOLDSIGN_CHAIN_BACKFILL === 'true') {
    setTimeout(() => {
      void backfillBoldSignDocumentChain(2)
        .then((r) => console.log(`[BoldSign] chain backfill done: ${r.added} added, ${r.updated} statuses refreshed`))
        .catch((err) => console.warn('[BoldSign] chain backfill failed:', (err as Error)?.message));
    }, 90_000).unref?.();
  }
}
