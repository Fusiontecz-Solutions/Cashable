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
