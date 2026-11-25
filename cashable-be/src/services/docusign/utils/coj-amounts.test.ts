import { cojFacts, cojInputs } from './coj-typed-document';

describe('COJ amounts are the repayment (RTR), not the funded amount', () => {
  const deal = { purchase_amount: '22000', purchase_price: '34100' };
  it('YOUR AUTHORIZED REP: $34,100.00, judgment $41,600.00', () => {
    expect(cojFacts(deal)).toMatchObject({ purchase: '$34,100.00', judgment: '$41,600.00' });
  });
  it('ignores an old saved total derived from the funded amount (22,000 + 7,500)', () => {
    expect(cojFacts({ ...deal, coj_sum_with_default: '29,500.00' }).judgment).toBe('$41,600.00');
  });
  it('keeps a total typed by hand, and a repayment edited in Review', () => {
    expect(cojFacts({ ...deal, coj_sum_with_default: '45,000.00' }).judgment).toBe('$45,000.00');
    expect(cojFacts({ ...deal, coj_repayment_amount: '30,000' })).toMatchObject({ purchase: '$30,000.00', judgment: '$37,500.00' });
  });
  it('every COJ lists the repayment as its Review input', () => {
    for (const kind of ['coj_iowa', 'coj_ny_business', 'coj_ny_general', 'coj_ny_merchant'] as const) {
      const inputs = cojInputs(kind, deal);
      expect(inputs.find((i) => i.variable === 'coj_repayment_amount')?.value).toBe('34,100.00');
      expect(inputs.some((i) => i.variable === 'purchase_amount')).toBe(false);
    }
  });
});

describe('COJ names: one space after each comma', () => {
  it('adds the missing space between names, keeps amounts', () => {
    const f = cojFacts({
      business_name_with_dba: 'AZURE HOME HEALTHCARE LLC DBA AZURE HOME HEALTHCARE',
      coj_additional_names: 'SLJ INVESTMENTS CORPORATION,COZY SKATE COMPANY',
      owner1_guarantor_name: 'DARNA GOINS FINKELSTEIN',
      purchase_price: '34,100',
    });
    expect(f.merchant).toBe('AZURE HOME HEALTHCARE LLC DBA AZURE HOME HEALTHCARE, SLJ INVESTMENTS CORPORATION, COZY SKATE COMPANY');
    expect(f.purchase).toBe('$34,100.00');
  });
});

describe('Exhibit A companies flow into every COJ', () => {
  const base = { business_name_with_dba: 'AZURE HOME HEALTHCARE LLC', client_legal_name: 'AZURE HOME HEALTHCARE LLC' };
  it('lists every Exhibit A company, then typed names, without duplicates or the merchant itself', () => {
    const f = cojFacts({
      ...base,
      exhibit_a_value_1: 'SLJ INVESTMENTS CORPORATION',
      exhibit_a_value_2: 'Azure Home Healthcare LLC',
      exhibit_a_value_3: 'COZY SKATE COMPANY',
      exhibit_a_address_1: '123 MAIN ST, NORFOLK, VA 23510',
      coj_additional_names: 'cozy skate company; PEOPLEFIRST MANAGEMENT',
    });
    expect(f.extraNames).toEqual(['SLJ INVESTMENTS CORPORATION', 'COZY SKATE COMPANY', 'PEOPLEFIRST MANAGEMENT']);
    expect(f.merchant).not.toMatch(/MAIN ST/); // addresses never reach the COJ
  });
  it('a company removed from Exhibit A is gone from the COJ', () => {
    expect(cojFacts({ ...base, exhibit_a_value_1: '' }).extraNames).toEqual([]);
  });
});
