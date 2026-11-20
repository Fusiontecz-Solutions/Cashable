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
    expect(f.agreementDate).toBe('November 19, 2026');
    expect(f.dayOrdinal).toBe('19th');
    expect(f.owner).toBe('JANE Q PUBLIC');
    expect(f.ownerState).toBe('MARYLAND');
  });
});

describe('renderTypedCoj', () => {
  it.each(['coj_iowa', 'coj_ny_business', 'coj_ny_general', 'coj_ny_merchant'] as const)('renders %s', async (kind) => {
    const out = await renderTypedCoj(kind, values);
    const doc = await PDFDocument.load(out.pdf);
    expect(doc.getPageCount()).toBe(out.pageCount);
    if (kind === 'coj_iowa') {
      expect(out.placements.filter((p) => p.type === 'signature')).toHaveLength(1);
      expect(out.placements.filter((p) => p.type === 'initial')).toHaveLength(out.pageCount);
    } else {
      expect(out.placements).toHaveLength(0); // notarised: signed on paper
    }
    for (const p of out.placements) {
      expect(Number(p.pageNumber)).toBeLessThanOrEqual(out.pageCount);
      expect(Number(p.y)).toBeGreaterThan(0);
    }
  });
});
