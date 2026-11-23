jest.mock('../../config/prismaClient', () => ({ __esModule: true, default: {} }));
jest.mock('puppeteer', () => ({ __esModule: true, default: {} }));

import { carryReviewOverrides } from './pearsign-package.service';

describe('carryReviewOverrides (re-staging after CRM changes)', () => {
  const prev = {
    crmValues: { amount: '$20,000.00', name: 'ACME LLC', rate: '1.35', gone: 'x' },
    overrides: { amount: '$25,000.00', name: 'ACME LLC DBA ACME', rate: '1.40', gone: 'y' },
  };
  it('a value changed in the CRM replaces the earlier Review edit', () => {
    const next = carryReviewOverrides(prev, { amount: '$30,000.00', name: 'ACME LLC', rate: '1.35' }, (k) => k !== 'gone');
    expect(next).toEqual({ name: 'ACME LLC DBA ACME', rate: '1.40' }); // amount: CRM wins; gone: key removed
  });
  it('drops edits that now equal the CRM value, and handles a first staging', () => {
    expect(carryReviewOverrides(prev, { ...prev.crmValues, rate: '1.40' }, () => true)).toEqual({
      amount: '$25,000.00',
      name: 'ACME LLC DBA ACME',
      gone: 'y',
    });
    expect(carryReviewOverrides(null, { amount: '1' }, () => true)).toEqual({});
  });
});
