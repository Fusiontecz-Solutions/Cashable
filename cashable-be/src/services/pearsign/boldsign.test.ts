jest.mock('../../config/prismaClient', () => ({ __esModule: true, default: {} }));
jest.mock('puppeteer', () => ({ __esModule: true, default: {} }));

import { boldSignStatus, isBoldSignEnvelopeId, signingProvider, toBoldSignEnvelopeId } from './boldsign-client';
import { looksLikePearSignEnvelopeId } from './pearsign-client';
import { boldSignSignersFor } from './pearsign-package.service';

describe('BoldSign ids', () => {
  const doc = '6cdd4a77-49a3-4686-a447-f26dd9dd133e';
  it('stores BoldSign documents as bs-<id>, routed through the shared signing flow', () => {
    const env = toBoldSignEnvelopeId(doc);
    expect(env).toBe(`bs-${doc}`);
    expect(isBoldSignEnvelopeId(env)).toBe(true);
    expect(looksLikePearSignEnvelopeId(env)).toBe(true);
    expect(isBoldSignEnvelopeId(`env-${doc}`)).toBe(false);
    expect(isBoldSignEnvelopeId(doc)).toBe(false);
  });
});

describe('signingProvider', () => {
  const prev = process.env.SIGNING_PROVIDER;
  afterEach(() => {
    process.env.SIGNING_PROVIDER = prev;
  });
  it('is PearSign unless SIGNING_PROVIDER=boldsign', () => {
    delete process.env.SIGNING_PROVIDER;
    expect(signingProvider()).toBe('pearsign');
    process.env.SIGNING_PROVIDER = 'BoldSign';
    expect(signingProvider()).toBe('boldsign');
  });
});

describe('boldSignStatus', () => {
  const p = (status: string, signers: Array<{ status?: string; isViewed?: boolean }> = []) =>
    boldSignStatus({ documentId: 'x', status, signerDetails: signers });
  it('maps BoldSign states to the CRM vocabulary', () => {
    expect(p('InProgress', [{ status: 'NotCompleted' }])).toBe('sent');
    expect(p('InProgress', [{ status: 'NotCompleted', isViewed: true }])).toBe('viewed');
    expect(p('InProgress', [{ status: 'Completed' }, { status: 'NotCompleted' }])).toBe('partially_signed');
    expect(p('Completed')).toBe('completed');
    expect(p('Revoked')).toBe('voided');
    expect(p('Declined')).toBe('declined');
    expect(p('Expired')).toBe('expired');
    expect(p('Draft')).toBe('draft');
  });
});

describe('boldSignSignersFor', () => {
  it('turns package fields into BoldSign fields: points → 96-DPI pixels, CRM values read-only', () => {
    const signers = boldSignSignersFor({
      pkg: {
        recipients: [
          { roleId: 'signer-1', roleName: 'Owner 1', name: 'Jane', email: 'jane@example.com' },
          { roleId: 'signer-2', roleName: 'Owner 2', name: 'Bob', email: 'bob@example.com' },
        ],
      } as never,
      createFields: [
        { fieldName: 'd1_name_p1', type: 'text', required: false, roleId: 'signer-1', position: { page: 1, x: 75, y: 150, width: 150, height: 15 }, fontSize: 10, fontFamily: 'helvetica' },
        { fieldName: 'd1_blank_p1', type: 'text', required: false, roleId: 'signer-1', position: { page: 1, x: 75, y: 180, width: 150, height: 15 } },
        { fieldName: 'd1_sig_p2', type: 'signature', required: true, roleId: 'signer-1', position: { page: 2, x: 60, y: 600, width: 130, height: 20 } },
        { fieldName: 'd1_init_p2', type: 'initials', required: true, roleId: 'signer-2', position: { page: 2, x: 500, y: 740, width: 42, height: 12 } },
        { fieldName: 'd1_date_p2', type: 'date', required: true, roleId: 'signer-1', position: { page: 2, x: 300, y: 600, width: 100, height: 16 } },
      ],
      fieldValues: { d1_name_p1: 'GREEN GODDESS LLC' },
    });
    expect(signers.map((s) => [s.emailAddress, s.signerOrder, s.formFields.length])).toEqual([
      ['jane@example.com', 1, 4],
      ['bob@example.com', 2, 1],
    ]);
    const [name, blank, sig, date] = signers[0].formFields;
    expect(name).toMatchObject({ fieldType: 'TextBox', value: 'GREEN GODDESS LLC', isReadOnly: true, fontSize: 13, font: 'Helvetica', pageNumber: 1 });
    expect(name.bounds).toEqual({ x: 100, y: 200, width: 200, height: 20 });
    expect(blank).toMatchObject({ fieldType: 'TextBox', isReadOnly: false });
    expect(blank.value).toBeUndefined();
    expect(sig).toMatchObject({ fieldType: 'Signature', isRequired: true, pageNumber: 2 });
    expect(date.fieldType).toBe('DateSigned');
    expect(signers[1].formFields[0].fieldType).toBe('Initial');
    // ids are unique and BoldSign-safe
    const ids = signers.flatMap((s) => s.formFields.map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_]+$/);
  });
});

describe('ACH debit-day tick boxes in BoldSign', () => {
  it('sends a ticked box as read-only "X" and leaves an unticked one off', () => {
    const [signer] = boldSignSignersFor({
      pkg: { recipients: [{ roleId: 'signer-1', roleName: 'Owner 1', name: 'Jane', email: 'jane@example.com' }] } as never,
      createFields: [
        { fieldName: 'd1_ach_days_mon_fri_check_p12', type: 'text', required: false, roleId: 'signer-1', position: { page: 12, x: 60, y: 500, width: 14, height: 14 } },
        { fieldName: 'd1_ach_days_seven_check_p12', type: 'text', required: false, roleId: 'signer-1', position: { page: 12, x: 300, y: 500, width: 14, height: 14 } },
      ],
      fieldValues: { d1_ach_days_mon_fri_check_p12: 'X' },
    });
    expect(signer.formFields).toHaveLength(1);
    expect(signer.formFields[0]).toMatchObject({ value: 'X', isReadOnly: true });
  });
});

describe('BoldSign CC and file name', () => {
  it('CRM CC emails go to BoldSign as CC (never a signer twice, no duplicates)', () => {
    const { boldSignCcList } = jest.requireActual('./boldsign-client');
    expect(
      boldSignCcList(['Office@cashablefunding.com', 'office@cashablefunding.com', 'jane@example.com', 'bad', ' ariel@cashablefunding.com '], [{ emailAddress: 'jane@example.com' }]),
    ).toEqual([{ emailAddress: 'office@cashablefunding.com' }, { emailAddress: 'ariel@cashablefunding.com' }]);
  });
  it('names the PDF "CASHABLE FUND LLC: <Merchant>"', () => {
    const { boldSignPackageFileName } = jest.requireActual('./pearsign-package.service');
    expect(boldSignPackageFileName({ pkg: { title: 'X — Contract' }, values: { client_legal_name: 'YOUR AUTHORIZED REP INC' } })).toBe(
      'CASHABLE FUND LLC꞉ YOUR AUTHORIZED REP INC.pdf',
    );
  });
});

describe('BoldSign reviewers and always-CC', () => {
  const { withBoldSignReviewers, boldSignCcFor } = jest.requireActual('./pearsign-package.service');
  it('reviewers go first; signers follow in their order', () => {
    const out = withBoldSignReviewers(
      [
        { name: 'Jane', emailAddress: 'jane@example.com', signerOrder: 1, formFields: [] },
        { name: 'Bob', emailAddress: 'bob@example.com', signerOrder: 2, formFields: [] },
      ],
      ['larry@cashablefunding.com', 'jane@example.com'],
    );
    expect(out.map((s: { emailAddress: string; signerOrder: number; signerType?: string }) => [s.emailAddress, s.signerOrder, s.signerType ?? 'Signer'])).toEqual([
      ['larry@cashablefunding.com', 1, 'Reviewer'],
      ['jane@example.com', 2, 'Signer'],
      ['bob@example.com', 3, 'Signer'],
    ]);
  });
  it('office@, ariel@ and edward@ are always CC (a reviewer is not CC too)', () => {
    expect(boldSignCcFor({ ccEmails: ['x@example.com', 'larry@cashablefunding.com'], reviewerEmails: ['larry@cashablefunding.com'] })).toEqual([
      'office@cashablefunding.com',
      'ariel@cashablefunding.com',
      'edward@cashablefunding.com',
      'x@example.com',
    ]);
  });
});

describe('contract values print in capitals', () => {
  const { contractValueCase } = jest.requireActual('./pearsign-package.service');
  it('capitalises values, keeps emails, links and encrypted values as typed', () => {
    expect(contractValueCase('November 23, 2026')).toBe('NOVEMBER 23, 2026');
    expect(contractValueCase('Corporation')).toBe('CORPORATION');
    expect(contractValueCase('Thursday')).toBe('THURSDAY');
    expect(contractValueCase('Jane.Doe@Example.com')).toBe('Jane.Doe@Example.com');
    expect(contractValueCase('https://Example.com/x')).toBe('https://Example.com/x');
    expect(contractValueCase('enc:v1:AbC')).toBe('enc:v1:AbC');
  });
});

describe('ACH payment terms are read-only for the merchant', () => {
  it('amount, percentage, debit day and note stay read-only even when empty; other empty boxes stay editable', () => {
    const [signer] = boldSignSignersFor({
      pkg: { recipients: [{ roleId: 'signer-1', roleName: 'Owner 1', name: 'Jane', email: 'jane@example.com' }] } as never,
      createFields: [
        { fieldName: 'd1_ach_following_days_day_p12', type: 'text', required: false, roleId: 'signer-1', position: { page: 12, x: 138, y: 490, width: 56, height: 14 } },
        { fieldName: 'd1_ach_following_days_p12', type: 'text', required: false, roleId: 'signer-1', position: { page: 12, x: 200, y: 490, width: 300, height: 14 } },
        { fieldName: 'd1_purchase_percent_p12', type: 'text', required: false, roleId: 'signer-1', position: { page: 12, x: 429, y: 474, width: 60, height: 14 } },
        { fieldName: 'd1_remittance_p12', type: 'text', required: false, roleId: 'signer-1', position: { page: 12, x: 133, y: 473, width: 90, height: 14 } },
        { fieldName: 'd1_exhibit_a_tax_id_1_p17', type: 'text', required: false, roleId: 'signer-1', position: { page: 17, x: 405, y: 145, width: 145, height: 14 } },
      ],
      fieldValues: { d1_remittance_p12: '2,306.00' },
    });
    expect(signer.formFields.map((f) => [f.name, f.isReadOnly])).toEqual([
      ['d1_ach_following_days_day_p12', true],
      ['d1_ach_following_days_p12', true],
      ['d1_purchase_percent_p12', true],
      ['d1_remittance_p12', true],
      ['d1_exhibit_a_tax_id_1_p17', false],
    ]);
  });
});
