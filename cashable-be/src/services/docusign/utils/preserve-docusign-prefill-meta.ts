/**
 * Keys that store DocuSign envelope lifecycle / history on Contract.contractPrefillOverrides.
 * FE prefill saves must not wipe these when they rebuild the JSON blob.
 */
export const DOCUSIGN_ENVELOPE_PREFILL_META_KEYS = [
  'contractSendHistory',
  'mainContractSendPackage',
  'achAuthorizationDropbox Sign',
  'achSendHistory',
  'standalonePackageDropbox Sign',
  'standalonePackageSendHistory',
  'documentSendHistory',
  'documentTemplateEnvelopeByMappingId',
  'documentTemplatePrefillByMappingId',
  'lastAchSentFunder',
  'contractSignerOverrides',
  'docusignEnvelopeResends',
  'pearsignMainContract',
  'pearsignPackage',
] as const;

/**
 * Server-owned envelope state: only the PearSign services write these. A FE prefill save
 * may carry a stale copy loaded before send/sign, so the stored value always wins.
 */
const SERVER_OWNED_PREFILL_META_KEYS = new Set<string>(['pearsignMainContract']);

function asPrefillObject(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function pickPreservedDocuSignMeta(
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const preserved: Record<string, unknown> = {};
  for (const key of DOCUSIGN_ENVELOPE_PREFILL_META_KEYS) {
    if (existing[key] !== undefined) {
      preserved[key] = existing[key];
    }
  }
  return preserved;
}

/**
 * Merge incoming prefill overrides onto existing, keeping DocuSign history/capsule
 * keys from existing when the incoming payload omits them.
 *
 * When incoming is null (clear overrides), form field overrides are cleared but
 * DocuSign envelope metadata is retained so sent docs do not disappear from CRM.
 */
export function mergePreservingDocuSignEnvelopeMeta(
  existing: unknown,
  incoming: unknown,
): Record<string, unknown> | null {
  const prev = asPrefillObject(existing);

  if (incoming == null) {
    if (!prev) return null;
    const preserved = pickPreservedDocuSignMeta(prev);
    return Object.keys(preserved).length > 0 ? preserved : null;
  }

  if (typeof incoming !== 'object' || Array.isArray(incoming)) {
    return null;
  }

  const next = { ...(incoming as Record<string, unknown>) };
  if (!prev) return next;

  for (const key of DOCUSIGN_ENVELOPE_PREFILL_META_KEYS) {
    if (prev[key] === undefined) continue;
    if (next[key] === undefined || SERVER_OWNED_PREFILL_META_KEYS.has(key)) {
      next[key] = prev[key];
    }
  }
  return next;
}
