/**
 * Provision PearSign templates for every addendum, ACH form and state disclosure (daily AND
 * weekly kept separate) that a funder has uploaded (BoldSignTemplate rows other than the
 * main contract), with every field mapped to its CRM layout variable.
 *
 * Source of truth = what the CRM actually sends: each document is loaded with
 * loadSupplementalLayoutPackage() — the same loader the Dropbox Sign / PearSign package
 * send uses — so the PDF and field coordinates are exactly the production ones.
 * Field names follow the contract convention: `<layoutVariable>_p<page>[b…]` for CRM
 * values, `signature_o<n>_p<page>` / `initials_o<n>_p<page>` for signers.
 *
 * Layouts with `owners >= 2` placements (ACH, Prepay Discount, Waiver) get a 1-owner and a
 * 2-owner template; the others one template (ownerCount 1, used for any owner count).
 *
 * The DOCS/ folder is compared for reference: a document whose PDF differs from DOCS/ is
 * reported, never silently swapped (field positions are calibrated to the production PDF).
 *
 * Usage:
 *   npx ts-node --transpile-only src/scripts/createPearSignDocumentTemplates.ts --dry-run
 *   npx ts-node --transpile-only src/scripts/createPearSignDocumentTemplates.ts --register [--funder=<uuid>] [--type=disclosure]
 */
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import prisma from '../config/prismaClient';
import { loadSupplementalLayoutPackage } from '../services/docusign/utils/platform-layout-envelope';
import { isPearSignConfigured, listPearSignTemplates } from '../services/pearsign/pearsign-client';
import { provisionPearSignTemplate } from '../services/pearsign/pearsign-provision';
import { registerPearSignTemplate } from '../services/pearsign/pearsign-template-registry';
import { buildPearSignTemplateSpec, type PearSignOwnerVariant } from '../services/pearsign/pearsign-template-spec';

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'] as const;
  }),
);
const DRY_RUN = args.get('dry-run') === 'true';
const REGISTER = args.get('register') === 'true';
const ONLY_FUNDER = args.get('funder');
const ONLY_TYPE = args.get('type');
const DOCS_DIR = args.get('docs') || path.resolve(__dirname, '../../../DOCS');

function md5(buf: Buffer) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

function docsIndex(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.pdf$/i.test(e.name)) out.set(md5(fs.readFileSync(p)), path.relative(DOCS_DIR, p));
    }
  };
  walk(DOCS_DIR);
  return out;
}

async function main() {
  if (!isPearSignConfigured()) throw new Error('PEARSIGN_API_KEY is not set.');
  const funders = await prisma.funderProfile.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  const funderById = new Map(funders.map((f) => [f.id, f]));
  const rows = await prisma.boldSignTemplate.findMany({
    where: { type: { not: 'contract' }, pdfUrl: { not: null }, ...(ONLY_TYPE ? { type: ONLY_TYPE } : {}) },
    orderBy: [{ type: 'asc' }, { state: 'asc' }, { frequency: 'asc' }],
  });
  const docs = docsIndex();
  const existing = DRY_RUN ? [] : await listPearSignTemplates();
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const funderId = String(row.layoutKey || '').match(/^funder_([0-9a-f-]{36})/i)?.[1] ?? '';
    const funder = funderById.get(funderId);
    if (!funder || (ONLY_FUNDER && funder.id !== ONLY_FUNDER)) continue;

    let pack;
    try {
      pack = await loadSupplementalLayoutPackage(row.id, { funderProfileId: funder.id, funderName: funder.name });
    } catch (err) {
      console.error(`✗ ${funder.name} — ${row.name}: layout/PDF could not be loaded: ${(err as Error).message}`);
      results.push({ funder: funder.name, document: row.name, error: (err as Error).message });
      continue;
    }
    let pdf = Buffer.from(pack.documentBase64, 'base64');
    let docsFile = docs.get(md5(pdf)) ?? null;
    // Guard against a disclosure row whose production PDF is the OTHER frequency's file
    // (found: "virginia daily" points at Weekly_Virginia). Use the matching DOCS/ file instead.
    if (row.type === 'disclosure' && row.frequency && row.state) {
      const want = row.frequency.toLowerCase();
      const stateRe = new RegExp(row.state.replace(/\s+/g, '[ _]'), 'i');
      const wrongFrequency = docsFile && !new RegExp(`(^|[\\\\/])${want}_`, 'i').test(docsFile);
      if (wrongFrequency) {
        const fix = [...docs.values()].find((f) => new RegExp(`(^|[\\\\/])${want}_`, 'i').test(f) && stateRe.test(f));
        if (fix) {
          console.warn(`! ${row.name}: production PDF is "${docsFile}" (wrong frequency) — using DOCS/${fix}`);
          pdf = fs.readFileSync(path.join(DOCS_DIR, fix));
          docsFile = fix;
        }
      }
    }
    const pages = (await PDFDocument.load(pdf, { ignoreEncryption: true })).getPageCount();
    const variants: PearSignOwnerVariant[] = pack.placements.some((p) => p.when) ? [1, 2] : [1];

    for (const owners of variants) {
      const label = variants.length > 1 ? row.name : row.name.replace(/^CASHABLE FUND LLC |^CASHABLE LLC /, '');
      let spec;
      try {
        spec = buildPearSignTemplateSpec({ layout: pack, owners, funderName: funder.name, documentLabel: label });
      } catch (err) {
        console.error(`✗ ${funder.name} — ${row.name}: ${(err as Error).message}`);
        continue;
      }
      if (variants.length === 1) spec.name = `${funder.name} — ${label}`;
      spec.category = row.type === 'disclosure' ? `disclosure-${row.frequency || 'other'}` : row.type;
      const summary = {
        funder: funder.name,
        document: row.name,
        type: row.type,
        state: row.state,
        frequency: row.frequency,
        owners,
        layout: pack.key,
        pages,
        fields: spec.fields.length,
        crmFields: spec.fields.filter((f) => !f.signerFilled).length,
        docsFile: docsFile ?? 'not in DOCS (production PDF used)',
      };
      if (!spec.fields.some((f) => f.type === 'signature' || f.type === 'initials')) {
        console.warn(`! ${spec.name}: layout has no signature/initials placement`);
      }
      if (DRY_RUN) {
        console.log('• (dry run)', JSON.stringify(summary));
        results.push(summary);
        continue;
      }
      try {
        const r = await provisionPearSignTemplate({ spec, pdf, existing });
        if (r.created) existing.push(r.template);
        console.log(
          `${r.ok ? '✓' : '✗'} ${spec.name} → ${r.template.id} (${r.template.fields?.length ?? 0}/${spec.fields.length} fields${r.created ? ', created' : ', reused'})` +
            (r.missing.length ? ` missing=${r.missing.slice(0, 5)}` : '') +
            (r.moved.length ? ` moved=${r.moved.slice(0, 5)}` : ''),
        );
        if (r.ok && REGISTER) {
          await registerPearSignTemplate({
            funderProfileId: funder.id,
            documentType: row.type,
            ownerCount: owners,
            state: row.state ?? null,
            frequency: row.frequency ?? null,
            layoutKey: String(row.layoutKey || pack.key),
            sourcePdfUrl: row.pdfUrl,
            sourcePdfSha256: crypto.createHash('sha256').update(pdf).digest('hex'),
            pearsignTemplateId: r.template.id,
            name: r.template.name,
            fieldCount: r.template.fields?.length ?? spec.fields.length,
          });
        }
        results.push({ ...summary, pearsignTemplateId: r.template.id, verified: r.ok });
      } catch (err) {
        console.error(`✗ ${spec.name}: ${(err as Error).message}`);
        results.push({ ...summary, error: (err as Error).message });
        if (/limit|quota|plan/i.test((err as Error).message)) {
          console.error('Stopping: PearSign template limit reached.');
          break;
        }
      }
    }
  }
  console.log(
    `\nDone: ${results.filter((r) => r.verified).length} verified, ${results.filter((r) => r.error).length} failed, ${results.length} total.`,
  );
}

main()
  .catch((err) => {
    console.error('Failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
