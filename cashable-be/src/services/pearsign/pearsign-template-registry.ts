import prisma from '../../config/prismaClient';
import type { PearSignOwnerVariant } from './pearsign-template-spec';

/**
 * PearSign template ids per funder × document purpose × variant ("PearSignTemplate" table).
 * Rows are written by src/scripts/createPearSignContractTemplates.ts after the template
 * has been created in PearSign and verified field-by-field.
 */

export type PearSignTemplateRow = {
  id: string;
  funderProfileId: string;
  documentType: string;
  ownerCount: number;
  state: string | null;
  frequency: string | null;
  layoutKey: string;
  sourcePdfUrl: string | null;
  pearsignTemplateId: string;
  name: string;
  fieldCount: number;
};

/** Prisma error when the table is missing (manual_pearsign_templates.sql not applied yet). */
function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e?.code === 'P2021' || /PearSignTemplate.*does not exist|relation "PearSignTemplate"/i.test(String(e?.message || ''));
}

export async function registerPearSignTemplate(input: {
  funderProfileId: string;
  documentType: string;
  ownerCount: PearSignOwnerVariant;
  state?: string | null;
  frequency?: string | null;
  layoutKey: string;
  sourcePdfUrl?: string | null;
  sourcePdfSha256?: string | null;
  pearsignTemplateId: string;
  name: string;
  fieldCount: number;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // One active template per funder × purpose × variant: retire the previous one.
    await tx.pearSignTemplate.updateMany({
      where: {
        funderProfileId: input.funderProfileId,
        documentType: input.documentType,
        ownerCount: input.ownerCount,
        state: input.state ?? null,
        frequency: input.frequency ?? null,
        isActive: true,
        NOT: { pearsignTemplateId: input.pearsignTemplateId },
      },
      data: { isActive: false },
    });
    await tx.pearSignTemplate.upsert({
      where: { pearsignTemplateId: input.pearsignTemplateId },
      create: {
        funderProfileId: input.funderProfileId,
        documentType: input.documentType,
        ownerCount: input.ownerCount,
        state: input.state ?? null,
        frequency: input.frequency ?? null,
        layoutKey: input.layoutKey,
        sourcePdfUrl: input.sourcePdfUrl ?? null,
        sourcePdfSha256: input.sourcePdfSha256 ?? null,
        pearsignTemplateId: input.pearsignTemplateId,
        name: input.name,
        fieldCount: input.fieldCount,
        isActive: true,
      },
      update: {
        layoutKey: input.layoutKey,
        sourcePdfUrl: input.sourcePdfUrl ?? null,
        sourcePdfSha256: input.sourcePdfSha256 ?? null,
        name: input.name,
        fieldCount: input.fieldCount,
        isActive: true,
      },
    });
  });
}

/** Active main-contract templates for a funder (both owner variants), or [] when none / table missing. */
export async function listPearSignContractTemplates(funderProfileId: string): Promise<PearSignTemplateRow[]> {
  const id = String(funderProfileId || '').trim();
  if (!id) return [];
  try {
    return await prisma.pearSignTemplate.findMany({
      where: { funderProfileId: id, documentType: 'contract', isActive: true },
      orderBy: { ownerCount: 'asc' },
      select: {
        id: true,
        funderProfileId: true,
        documentType: true,
        ownerCount: true,
        state: true,
        frequency: true,
        layoutKey: true,
        sourcePdfUrl: true,
        pearsignTemplateId: true,
        name: true,
        fieldCount: true,
      },
    });
  } catch (err) {
    if (isMissingTable(err)) {
      console.warn('[PearSign] PearSignTemplate table missing — apply prisma/migrations/manual_pearsign_templates.sql');
      return [];
    }
    throw err;
  }
}

/** Template for a funder's main contract and the deal's owner count (1 → 1-owner variant, ≥2 → 2-owner). */
export async function resolvePearSignContractTemplate(
  funderProfileId: string,
  ownerCount: number,
): Promise<PearSignTemplateRow | null> {
  const rows = await listPearSignContractTemplates(funderProfileId);
  const variant: PearSignOwnerVariant = ownerCount >= 2 ? 2 : 1;
  return rows.find((r) => r.ownerCount === variant) ?? null;
}

/**
 * Every active PearSign template registered for a funder (contract, addendums/ACH, disclosures),
 * optionally narrowed by document type. Used by the Create Contract preview so the PDF shown is
 * the exact source PDF the PearSign template was built from.
 */
export async function listPearSignTemplatesForFunder(
  funderProfileId: string,
  documentType?: string | null,
): Promise<PearSignTemplateRow[]> {
  const id = String(funderProfileId || '').trim();
  if (!id) return [];
  const type = String(documentType || '').trim();
  try {
    return await prisma.pearSignTemplate.findMany({
      where: { funderProfileId: id, isActive: true, ...(type ? { documentType: type } : {}) },
      orderBy: [{ documentType: 'asc' }, { state: 'asc' }, { frequency: 'asc' }, { ownerCount: 'asc' }],
      select: {
        id: true,
        funderProfileId: true,
        documentType: true,
        ownerCount: true,
        state: true,
        frequency: true,
        layoutKey: true,
        sourcePdfUrl: true,
        pearsignTemplateId: true,
        name: true,
        fieldCount: true,
      },
    });
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}
