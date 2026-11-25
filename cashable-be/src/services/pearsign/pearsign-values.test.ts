import { crmMoney, crmValue } from './pearsign-values';

describe('crmValue: package values are stored per document', () => {
  it('finds d<n>__ keys, plain keys first, never COJ inputs', () => {
    const v = { d1__client_legal_name: 'AZURE HOME HEALTHCARE LLC', d3__coj1__purchase_amount: '1', d2__purchase_amount: '25000' };
    expect(crmValue(v, 'client_legal_name')).toBe('AZURE HOME HEALTHCARE LLC');
    expect(crmValue(v, 'purchase_amount')).toBe('25000');
    expect(crmValue({ purchase_amount: '9', d1__purchase_amount: '1' }, 'purchase_amount')).toBe('9');
    expect(crmValue(null, 'x')).toBe('');
    expect(crmMoney('25000')).toBe('$25,000.00');
    expect(crmMoney('')).toBe('');
  });
});
