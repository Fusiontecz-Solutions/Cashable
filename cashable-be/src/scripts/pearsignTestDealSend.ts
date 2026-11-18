/**
 * End-to-end PearSign test (requested): creates a clearly labelled TEST deal per funder with
 * dummy merchant data and sends ONE PearSign envelope per funder containing the main contract,
 * every addendum / ACH form the funder has, and (CASHABLE FUND LLC) all 22 daily + weekly
 * state disclosures — through the production code path:
 *   DocusignService.mergeAndSendTemplates({ signingProvider: 'pearsign' })  → stage package
 *   sendPearSignPackage()                                                    → one envelope
 *
 * Usage: npx ts-node --transpile-only src/scripts/pearsignTestDealSend.ts --email=<signer> --actor=<userId> [--funder=<uuid>] [--dry-run]
 */
import 'dotenv/config';
import prisma from '../config/prismaClient';
import cloudinaryConnect from '../config/cloudinary';
import { DocusignService } from '../services/docusign/docusign.service';
import { getPearSignPackageReview, sendPearSignPackage } from '../services/pearsign/pearsign-package.service';

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'] as const;
  }),
);
const EMAIL = String(args.get('email') || '').trim().toLowerCase();
const ACTOR = String(args.get('actor') || '').trim();
const ONLY_FUNDER = args.get('funder');
const DRY_RUN = args.get('dry-run') === 'true';

const OWNER = { first: 'Test', last: 'Owner', name: 'Test Owner' };

/** Dummy deal values, using the same CRM prefill ids the Create Contract form sends. */
function dummyPrefill(funderName: string, dealLabel: string): Array<{ id: string; value: string }> {
  const today = new Date();
  const mmddyyyy = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
  const v: Record<string, string> = {
    agreement_date: mmddyyyy,
    signature_date: mmddyyyy,
    business_legal_name: dealLabel,
    client_legal_name: dealLabel,
    doing_business_as: 'TEST PEARSIGN DBA',
    entity_type: 'LLC',
    federal_tax_id_ein: '00-0000000',
    security_tax_ein: '00-0000000',
    business_address: '100 TEST STREET',
    business_address_city: 'NEW YORK',
    business_address_state: 'NY',
    business_address_zip: '10001',
    mailing_address: '100 TEST STREET',
    mailing_address_city: 'NEW YORK',
    mailing_address_state: 'NY',
    mailing_address_zip: '10001',
    business_address_contract: '100 TEST STREET',
    business_address_contract_city: 'NEW YORK',
    business_address_contract_state: 'NY',
    business_address_contract_zip: '10001',
    guarantor_address: '200 OWNER AVENUE',
    guarantor_address_city: 'NEW YORK',
    guarantor_address_state: 'NY',
    guarantor_address_zip: '10002',
    client_email: EMAIL,
    client_phone: '(212) 555-0100',
    client_name: OWNER.name,
    client_name_by: OWNER.name,
    owner1_guarantor_name: OWNER.name,
    guaranty_client_name: OWNER.name,
    guaranty_owner1_ss: '000-00-0000',
    guaranty_owner1_driver_license: 'TEST-DL-0000',
    guaranty_guarantor1_name: OWNER.name,
    guaranty_guarantor1_ss: '000-00-0000',
    authorization_client_name_print: OWNER.name,
    authorization_client_bank_name: 'TEST BANK NA',
    authorization_client_bank_routing: '000000000',
    authorization_client_bank_account: '0000000000',
    authorization_client_tax_id: '00-0000000',
    purchase_amount: '25,000.00',
    purchase_price: '35,000.00',
    purchase_percent: '10.00',
    frequency: 'DAILY',
    remittance: '350.00',
    daily_payment: '350.00',
    appendix_underwriting_fees: '1,250.00',
    net_fund_provided: '23,750.00',
    funder_name: funderName,
    disclosure_funder_name: funderName,
  };
  return Object.entries(v).map(([id, value]) => ({ id, value }));
}

async function createTestDeal(funder: { id: string; name: string }, actorId: string) {
  const label = `TEST PEARSIGN – ${funder.name}`;
  // Reuse the TEST deal from an earlier (interrupted) run instead of creating a duplicate.
  const prior = await prisma.contract.findFirst({
    where: { funderName: funder.name, contractNumber: { startsWith: 'TEST-PEARSIGN-' } },
    orderBy: { id: 'desc' },
    select: { id: true, applicationId: true, clientId: true },
  });
  if (prior?.applicationId) {
    return { label, clientId: String(prior.clientId), applicationId: prior.applicationId, contractId: prior.id, reused: true };
  }
  const client = await prisma.client.create({
    data: {
      businessName: label,
      ownerFirstName: OWNER.first,
      ownerLastName: OWNER.last,
      ownerEmail: EMAIL,
      businessEmail: EMAIL,
      businessEntityType: 'LLC',
      businessAddress1: '100 TEST STREET',
      businessCity: 'NEW YORK',
      businessState: 'NY',
      businessZipCode: '10001',
      createdById: actorId,
    },
  });
  const app = await prisma.application.create({
    data: {
      clientId: client.id,
      priority: 'Low',
      salesRepresentativeId: actorId,
      createdById: actorId,
    },
  });
  const offer = await prisma.offerDecision.create({
    data: { applicationId: app.id, decision: 'approved' },
  });
  const now = new Date();
  const contract = await prisma.contract.create({
    data: {
      applicationId: app.id,
      clientId: client.id,
      offerId: offer.id,
      createdById: actorId,
      contractNumber: `TEST-PEARSIGN-${Date.now()}`,
      agreementDate: now,
      startDate: now,
      endDate: new Date(now.getTime() + 100 * 86400000),
      approvedAmount: 25000,
      totalAmount: 35000,
      contractLenght: 100,
      funderName: funder.name,
      status: 'DRAFT',
    },
  });
  await prisma.contractOwner.create({
    data: { contractId: contract.id, firstName: OWNER.first, lastName: OWNER.last, email: EMAIL },
  });
  return { label, clientId: client.id, applicationId: app.id, contractId: contract.id, reused: false };
}

async function main() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL)) throw new Error('--email=<signer email> is required');
  if (!ACTOR) throw new Error('--actor=<CRM user id> is required');
  const funders = await prisma.funderProfile.findMany({
    where: { isActive: true, ...(ONLY_FUNDER ? { id: ONLY_FUNDER } : {}) },
    select: { id: true, name: true, mainContractLayoutKey: true },
    orderBy: { name: 'asc' },
  });
  cloudinaryConnect();
  const docusign = new DocusignService();

  for (const funder of funders) {
    const docs = await prisma.boldSignTemplate.findMany({
      where: { type: { not: 'contract' }, pdfUrl: { not: null }, layoutKey: { startsWith: `funder_${funder.id}_` } },
      orderBy: [{ type: 'asc' }, { state: 'asc' }, { frequency: 'asc' }],
      select: { id: true, name: true, type: true },
    });
    console.log(`\n=== ${funder.name}: contract + ${docs.length} documents`);
    docs.forEach((d) => console.log(`   - ${d.name}`));
    if (DRY_RUN) continue;

    const deal = await createTestDeal(funder, ACTOR);
    console.log(`   ${deal.reused ? 'reusing' : 'created'} TEST deal: application ${deal.applicationId}, contract ${deal.contractId}`);

    const prefillFields = dummyPrefill(funder.name, deal.label);
    const roles = [{ signerRole: 'Owner', roleName: 'Owner', signerName: OWNER.name, signerEmail: EMAIL, signerOrder: 1 }];
    const staged = await docusign.mergeAndSendTemplates(ACTOR, {
      supplementalDocuments: docs.map((d) => ({ documentRef: d.id, prefillFields })),
      includeMainContract: true,
      mainContractLayoutKey: funder.mainContractLayoutKey,
      funderProfileId: funder.id,
      funderName: funder.name,
      roles,
      prefillFields,
      ownerCount: 1,
      applicationId: deal.applicationId,
      contractId: deal.contractId,
      ccEmails: [],
      title: `${deal.label} — Contract package`,
      message: 'TEST envelope from the Cashable CRM PearSign integration (contract + addendums + disclosures).',
      autoSend: false,
      signingProvider: 'pearsign',
    } as any);
    console.log('   staged:', JSON.stringify((staged as any)?.data));

    const review = await getPearSignPackageReview(deal.contractId);
    console.log(
      `   review: ${review.fields.length} CRM values (${review.blankKeys.length} blank), ${review.signerBoxes.length} signer boxes, blockers: ${review.blockers.length ? review.blockers.join(' | ') : 'none'}`,
    );
    const sent = await sendPearSignPackage(deal.contractId, ACTOR, {});
    console.log(
      `   SENT envelope ${sent.state.envelopeId} (template ${sent.state.templateId}) status=${sent.state.status} prefilled=${sent.prefilledFieldCount} blank=${sent.blankFieldCount} emailSent=${sent.emailSent}`,
    );
  }
}

main()
  .catch((err) => {
    console.error('FAILED:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
