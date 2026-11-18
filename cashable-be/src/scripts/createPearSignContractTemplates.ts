/**
 * Provision the main-contract templates in PearSign (phase 1 of the Dropbox Sign → PearSign move).
 *
 * For every active funder profile, and for each owner variant (1 owner / 2 owners):
 *   1. resolve the coordinate layout the Dropbox Sign send uses for that funder
 *      (resolveMainContractCoordinateLayoutKey) and the funder's production PDF
 *      (BoldSignTemplate.pdfUrl for FunderProfile.mainContractLayoutKey),
 *   2. build the PearSign template (pearsign-template-spec.ts),
 *   3. create it in PearSign, read it back and verify every field landed,
 *   4. with --register, record it in "PearSignTemplate" (manual_pearsign_templates.sql must be applied).
 *
 * Idempotent: a template whose exact name already exists in PearSign is reused, not re-created.
 *
 * Usage:
 *   npx ts-node --transpile-only src/scripts/createPearSignContractTemplates.ts --dry-run
 *   npx ts-node --transpile-only src/scripts/createPearSignContractTemplates.ts [--funder=<uuid>] [--owners=1|2] [--register]
 */
import 'dotenv/config';
import crypto from 'crypto';
import { PDFDocument } from 'pdf-lib';
import prisma from '../config/prismaClient';
import { getDocumentLayout } from '../services/docusign/layouts/document-layout.registry';
import { resolveMainContractCoordinateLayoutKey } from '../services/docusign/utils/resolve-main-contract-layout';
import { findBoldSignTemplatePdfUrlByExactLayoutKey } from '../services/docusign/platform-document-registry';
import { fetchRemoteAssetBuffer } from '../services/cloudinaryInlinePreviewService';
import {
  createPearSignTemplate,
  getPearSignTemplate,
  isPearSignConfigured,
  listPearSignTemplates,
  updatePearSignTemplate,
} from '../services/pearsign/pearsign-client';
import {
  buildPearSignTemplateSpec,
  toPearSignCreateFields,
  type PearSignOwnerVariant,
} from '../services/pearsign/pearsign-template-spec';
import { registerPearSignTemplate } from '../services/pearsign/pearsign-template-registry';

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'] as const;
  }),
);
const DRY_RUN = args.get('dry-run') === 'true';
const REGISTER = args.get('register') === 'true';
const ONLY_FUNDER = args.get('funder');
const ONLY_OWNERS = args.get('owners');

const DOCUMENT_LABEL = 'Future Receivables Agreement';

async function main() {
  if (!isPearSignConfigured()) throw new Error('PEARSIGN_API_KEY is not set.');

  const funders = await prisma.funderProfile.findMany({
    where: { isActive: true, ...(ONLY_FUNDER ? { id: ONLY_FUNDER } : {}) },
    select: { id: true, name: true, mainContractLayoutKey: true, allowedStates: true },
    orderBy: { name: 'asc' },
  });
  if (!funders.length) throw new Error('No active funder profiles matched.');

  const existing = DRY_RUN ? [] : await listPearSignTemplates();
  const results: Array<Record<string, unknown>> = [];

  for (const funder of funders) {
    const allowedStates = Array.isArray(funder.allowedStates)
      ? (funder.allowedStates as unknown[]).map(String)
      : [];
    const coordinateKey = resolveMainContractCoordinateLayoutKey({
      funderName: funder.name,
      mainContractLayoutKey: funder.mainContractLayoutKey,
      allowedStates,
    });
    const layout = getDocumentLayout(coordinateKey);
    const pdfUrl = await findBoldSignTemplatePdfUrlByExactLayoutKey(funder.mainContractLayoutKey);
    if (!pdfUrl) {
      console.error(`✗ ${funder.name}: no contract PDF uploaded for layout key ${funder.mainContractLayoutKey}; skipped.`);
      continue;
    }
    const pdf = await fetchRemoteAssetBuffer(pdfUrl);
    const sha256 = crypto.createHash('sha256').update(pdf).digest('hex');
    const pageCount = (await PDFDocument.load(pdf, { ignoreEncryption: true })).getPageCount();
    const maxPage = Math.max(...layout.placements.map((p) => Number(p.pageNumber) || 0));
    if (pageCount < maxPage) {
      console.error(`✗ ${funder.name}: PDF has ${pageCount} pages but layout "${coordinateKey}" places fields on page ${maxPage}; skipped.`);
      continue;
    }

    for (const owners of [1, 2] as PearSignOwnerVariant[]) {
      if (ONLY_OWNERS && Number(ONLY_OWNERS) !== owners) continue;
      const spec = buildPearSignTemplateSpec({ layout, owners, funderName: funder.name, documentLabel: DOCUMENT_LABEL });
      const summary = {
        funder: funder.name,
        funderProfileId: funder.id,
        owners,
        layoutKey: coordinateKey,
        name: spec.name,
        fields: spec.fields.length,
        pdfPages: pageCount,
        pdfSha256: sha256.slice(0, 12),
      };
      if (DRY_RUN) {
        console.log('• (dry run)', summary);
        results.push({ ...summary, dryRun: true });
        continue;
      }

      let template = existing.find((t) => t.name === spec.name) ?? null;
      if (template) {
        console.log(`• ${spec.name}: already in PearSign (${template.id}); reusing.`);
      } else {
        console.log(`• ${spec.name}: creating (${spec.fields.length} fields)…`);
        template = await createPearSignTemplate({
          name: spec.name,
          description: spec.description,
          category: spec.category,
          status: 'active',
          signerRoles: spec.signerRoles,
          fields: toPearSignCreateFields(spec),
          documentBase64: pdf.toString('base64'),
        });
      }

      // Read back and verify: every spec field present with the same page/position/role.
      const verify = async (id: string) => {
        const live = await getPearSignTemplate(id);
        const byName = new Map((live.fields ?? []).map((f) => [f.fieldName, f]));
        const missing = spec.fields.filter((f) => !byName.has(f.fieldName)).map((f) => f.fieldName);
        const moved = spec.fields
          .filter((f) => {
            const got = byName.get(f.fieldName);
            const p = got?.position;
            if (!got || !p) return false;
            return (
              got.roleId !== f.roleId ||
              Number(p.page) !== f.page ||
              Math.abs(Number(p.x) - f.x) > 1 ||
              Math.abs(Number(p.y) - f.y) > 1 ||
              Math.abs(Number(p.width) - f.width) > 1 ||
              Math.abs(Number(p.height) - f.height) > 1
            );
          })
          .map((f) => f.fieldName);
        const extra = (live.fields ?? []).length - spec.fields.length;
        const ok = !missing.length && !moved.length && extra === 0 && String(live.status).toLowerCase() === 'active';
        return { live, missing, moved, ok };
      };
      let { live, missing, moved, ok } = await verify(template.id);
      if (!ok) {
        console.log(`  … ${live.id} does not match the layout (missing=${missing.length}, moved=${moved.length}); repairing fields…`);
        await updatePearSignTemplate(live.id, {
          status: 'active',
          signerRoles: spec.signerRoles,
          fields: toPearSignCreateFields(spec),
        });
        ({ live, missing, moved, ok } = await verify(live.id));
      }
      console.log(
        `  ${ok ? '✓' : '✗'} ${live.id} status=${live.status} fields=${live.fields?.length ?? 0}/${spec.fields.length}` +
          (missing.length ? ` missing=${missing.slice(0, 8).join(',')}` : '') +
          (moved.length ? ` moved=${moved.slice(0, 8).join(',')}` : ''),
      );

      if (ok && REGISTER) {
        await registerPearSignTemplate({
          funderProfileId: funder.id,
          documentType: 'contract',
          ownerCount: owners,
          layoutKey: coordinateKey,
          sourcePdfUrl: pdfUrl,
          sourcePdfSha256: sha256,
          pearsignTemplateId: live.id,
          name: live.name,
          fieldCount: live.fields?.length ?? spec.fields.length,
        });
        console.log('  ✓ registered in PearSignTemplate');
      }
      results.push({ ...summary, pearsignTemplateId: live.id, verified: ok, missing, moved });
    }
  }

  console.log('\nRESULT ' + JSON.stringify(results, null, 2));
}

main()
  .catch((err) => {
    console.error('Failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
