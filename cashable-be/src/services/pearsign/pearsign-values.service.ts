import prisma from '../../config/prismaClient';
import {
  buildPlatformLayoutEnvelopeDefinition,
  collapseSignerRolesForLayoutEnvelope,
  countOwnersFromRoles,
} from '../docusign/utils/platform-layout-envelope';
import { resolveMainContractLayoutKeyForSend } from '../docusign/utils/resolve-main-contract-layout';
import { loadContractReverseDisbursementConfig } from '../pdf/reverseDisbursementSchedule.service';
import type { PrefillFieldInput } from '../docusign/utils/docusign-prefill';
import { PEARSIGN_OWNER1_ROLE_ID, PEARSIGN_OWNER2_ROLE_ID } from './pearsign-template-spec';

/**
 * CRM → PearSign field values for the main contract.
 *
 * There is deliberately NO second mapping table here. The values come from
 * the exact pipeline the Dropbox Sign send uses today:
 *
 *   Create Contract prefill list (Verify Prefill: id/value pairs from the FE)
 *     → buildPlatformLayoutEnvelopeDefinition (main contract only, not flattened)
 *       → text/date tabs, each labelled with its layout variable and carrying the value
 *
 * Each tab label is `<sourceTabLabel>[__<placementId>]`; the part before `__` is
 * the layout variable — the same base key the PearSign field names carry
 * (`<variable>_p<page>`). So a value lands in PearSign exactly where it prints
 * in the Dropbox Sign envelope, formatted identically.
 */

export type PearSignSignerRoleInput = Record<string, unknown> & {
  roleName?: string;
  signerRole?: string;
  signerName?: string;
  signerEmail?: string;
  signerOrder?: number;
};

export type PearSignCrmValues = {
  ownerCount: 1 | 2;
  /** Layout variable → value, as the Dropbox Sign envelope would print it. */
  values: Record<string, string>;
  /** Variables whose placements carried different values (first non-empty kept). */
  divergent: string[];
  /** Owner 1 (+ Owner 2) recipients, mapped to the PearSign template roles. */
  recipients: Array<{ roleId: string; roleName: string; name: string; email: string }>;
  layoutKeyForSend: string;
  reverseDisbursementEnabled: boolean;
};

type Tab = { tabLabel?: string; value?: string };

function baseVariableFromTabLabel(label: string): string {
  return String(label || '').split('__')[0].trim();
}

export async function computePearSignCrmValues(input: {
  contractId: number;
  funderProfileId: string;
  funderName?: string | null;
  contractState?: string | null;
  prefillFields: PrefillFieldInput[];
  roles: PearSignSignerRoleInput[];
  ownerCount?: number;
}): Promise<PearSignCrmValues> {
  const roles = (input.roles || []).filter((r) => r && typeof r === 'object');
  const ownerCount: 1 | 2 =
    (Number(input.ownerCount) || countOwnersFromRoles(roles)) >= 2 ? 2 : 1;

  const funder = await prisma.funderProfile.findUnique({
    where: { id: input.funderProfileId },
    select: { id: true, name: true, mainContractLayoutKey: true },
  });
  const funderName = input.funderName ?? funder?.name ?? null;

  const layoutKeyForSend = await resolveMainContractLayoutKeyForSend({
    mainContractLayoutKey: funder?.mainContractLayoutKey,
    funderName,
    funderProfileId: input.funderProfileId,
    state: input.contractState ?? null,
  });

  // The reverse disbursement schedule is a per-deal page appended to the main
  // contract — a fixed PearSign template cannot carry it, so callers block the send.
  let reverseDisbursementEnabled = false;
  try {
    reverseDisbursementEnabled = (await loadContractReverseDisbursementConfig(input.contractId)).enabled === true;
  } catch (err) {
    console.warn('[PearSign] reverse disbursement check failed:', (err as Error)?.message);
  }

  // contractId is omitted on purpose: it only triggers the reverse-disbursement
  // page append, which is not part of the PearSign template.
  const built = await buildPlatformLayoutEnvelopeDefinition({
    includeMainContract: true,
    supplementalRefs: [],
    supplementalDocuments: [],
    mainContractLayoutKey: layoutKeyForSend,
    funderProfileId: input.funderProfileId,
    funderName,
    contractState: input.contractState ?? null,
    roles,
    prefillFields: input.prefillFields || [],
    ownerCount,
    flattenPrefillInPdf: false,
    lockDataTabs: true,
  });

  const values: Record<string, string> = {};
  const divergent = new Set<string>();
  const signers = ((built.envelopeDefinition as { recipients?: { signers?: Array<{ tabs?: Record<string, Tab[]> }> } })
    .recipients?.signers ?? []);
  for (const signer of signers) {
    for (const bucket of ['textTabs', 'dateTabs'] as const) {
      for (const tab of signer.tabs?.[bucket] ?? []) {
        const variable = baseVariableFromTabLabel(String(tab.tabLabel || ''));
        const value = String(tab.value ?? '').trim();
        if (!variable || !value) continue;
        if (values[variable] === undefined) values[variable] = value;
        else if (values[variable] !== value) divergent.add(variable);
      }
    }
  }
  if (divergent.size) {
    console.warn(`[PearSign] contract ${input.contractId}: variables with differing per-placement values`, [...divergent]);
  }

  // Same Owner 1 / Owner 2 selection as the Dropbox Sign send (collapseSignerRolesForLayoutEnvelope).
  const collapsed = collapseSignerRolesForLayoutEnvelope(roles, ownerCount);
  const recipients = collapsed
    .filter((r) => String(r.signerEmail || '').trim())
    .slice(0, ownerCount)
    .map((r, i) => ({
      roleId: i === 0 ? PEARSIGN_OWNER1_ROLE_ID : PEARSIGN_OWNER2_ROLE_ID,
      roleName: i === 0 ? 'Owner 1' : 'Owner 2',
      name: String(r.signerName || '').trim(),
      email: String(r.signerEmail || '').trim().toLowerCase(),
    }));

  return {
    ownerCount,
    values,
    divergent: [...divergent],
    recipients,
    layoutKeyForSend,
    reverseDisbursementEnabled,
  };
}
