import { PDFDocument } from 'pdf-lib';
import { cojFacts, renderTypedCoj, typedCojKind } from './coj-typed-document';

const values = {
  funder_name: 'Cashable Fund LLC',
  business_name_with_dba: 'Acme Dental Care, P.A. DBA Essence Dental',
  owner1_guarantor_name: 'Jane Q Public',
  owner_state: 'Maryland',
  owner_county: "Prince George's",
  guarantor_address_full: '6200 Gold Yarrow Ln, Upper Marlboro, MD, 20772',
  business_address_full: '1 Main St — Suite 2, Largo, MD, 20774',
  business_county: "Prince George's",
  purchase_amount: '31000',
  agreement_date: '11/19/2026',
};

describe('typedCojKind', () => {
  it('recognises platform, funder-scoped and file-name COJ layouts', () => {
    expect(typedCojKind({ key: 'coj_iowa' })).toBe('coj_iowa');
    expect(typedCojKind({ key: 'funder_abc_addendum_coj_ny_general' })).toBe('coj_ny_general');
    expect(typedCojKind({ key: 'x', pdf: { fileName: 'coj_ny_merchant.pdf' } })).toBe('coj_ny_merchant');
    expect(typedCojKind({ key: 'ach_authorization' })).toBeNull();
  });
});

describe('cojFacts', () => {
  it('formats amounts, the judgment total, dates and upper-cases names', () => {
    const f = cojFacts(values);
    expect(f.purchase).toBe('$31,000.00');
    expect(f.judgment).toBe('$38,500.00'); // purchase + $7,500 default fee
    expect(f.agreementDate).toBe('NOVEMBER 19, 2026');
    expect(f.dayOrdinal).toBe('19TH');
    expect(f.owner).toBe('JANE Q PUBLIC');
    expect(f.ownerState).toBe('MARYLAND');
  });
});

describe('renderTypedCoj', () => {
  it.each(['coj_iowa', 'coj_ny_business', 'coj_ny_general', 'coj_ny_merchant'] as const)('renders %s', async (kind) => {
    const out = await renderTypedCoj(kind, values);
    const doc = await PDFDocument.load(out.pdf);
    expect(doc.getPageCount()).toBe(out.pageCount);
    // Every COJ (Iowa and New York) is signed in BoldSign: one signature, an initial per page.
    expect(out.placements.filter((p) => p.type === 'signature')).toHaveLength(1);
    expect(out.placements.filter((p) => p.type === 'initial')).toHaveLength(out.pageCount);
    for (const p of out.placements) {
      expect(Number(p.pageNumber)).toBeLessThanOrEqual(out.pageCount);
      expect(Number(p.y)).toBeGreaterThan(0);
    }
  });
});

describe('additional names', () => {
  it('follow the merchant everywhere it is named and are listed in the caption', () => {
    const f = cojFacts({ ...values, coj_additional_names: 'Essence Dental Care; Caroline Larosiliere DDS and Associates, P.A.' });
    expect(f.extraNames).toEqual(['ESSENCE DENTAL CARE', 'CAROLINE LAROSILIERE DDS AND ASSOCIATES, P.A.']);
    expect(f.merchant).toBe('ACME DENTAL CARE, P.A. DBA ESSENCE DENTAL, ESSENCE DENTAL CARE, CAROLINE LAROSILIERE DDS AND ASSOCIATES, P.A.');
  });
  it('renders every COJ with additional names', async () => {
    for (const kind of ['coj_iowa', 'coj_ny_business', 'coj_ny_general', 'coj_ny_merchant'] as const) {
      const out = await renderTypedCoj(kind, { ...values, coj_additional_names: 'Second Entity LLC' });
      expect(out.pageCount).toBeGreaterThan(0);
    }
  });
});

describe('first paragraph lists the defendants with "and" before the last name', () => {
  const v = {
    business_name_with_dba: "THE HIVE GROUP LLC DBA HONEY'S FRIED CHICKEN PALACE",
    coj_additional_names: 'HIVE GROUP LLC; FORGOTTEN COAST FISHING, INC.; NEWBLACK LLC',
    owner1_guarantor_name: 'MALCOLM S BEDELL',
  };
  const text = (runs: Array<{ text: string }>) => runs.map((r) => r.text).join('');
  it('several additional names: "A, B, C and D"', () => {
    expect(text(cojFacts(v).M({ and: true }))).toBe(
      "THE HIVE GROUP LLC DBA HONEY'S FRIED CHICKEN PALACE, HIVE GROUP LLC, FORGOTTEN COAST FISHING, INC. and NEWBLACK LLC",
    );
  });
  it('one additional name: "A and B"; none: just the business', () => {
    expect(text(cojFacts({ ...v, coj_additional_names: 'NEWBLACK LLC' }).M({ and: true }))).toBe(
      "THE HIVE GROUP LLC DBA HONEY'S FRIED CHICKEN PALACE and NEWBLACK LLC",
    );
    expect(text(cojFacts({ ...v, coj_additional_names: '' }).M({ and: true }))).toBe("THE HIVE GROUP LLC DBA HONEY'S FRIED CHICKEN PALACE");
  });
  it('the caption list is unchanged (commas, then "and <owner>" where the caption names the owner)', () => {
    expect(text(cojFacts(v).M())).toBe(
      "THE HIVE GROUP LLC DBA HONEY'S FRIED CHICKEN PALACE, HIVE GROUP LLC, FORGOTTEN COAST FISHING, INC., NEWBLACK LLC",
    );
  });
});
