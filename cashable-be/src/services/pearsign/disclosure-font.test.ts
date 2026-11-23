jest.mock('../../config/prismaClient', () => ({ __esModule: true, default: {} }));
jest.mock('puppeteer', () => ({ __esModule: true, default: {} }));
import { isDisclosureDocument } from './pearsign-package.service';
import { pearSignWidthFitFontSize } from './pearsign-template-spec';

describe('state disclosures print at 12pt', () => {
  it('finds the disclosure documents in a package', () => {
    expect(isDisclosureDocument({ name: 'Virginia Disclosure', layoutKey: 'virginia_daily' })).toBe(true);
    expect(isDisclosureDocument({ name: 'Anything', layoutKey: 'california_weekly' })).toBe(true);
    expect(isDisclosureDocument({ name: 'CT State Disclosure', layoutKey: null })).toBe(true);
    expect(isDisclosureDocument({ name: 'Contract', layoutKey: 'contract' })).toBe(false);
    expect(isDisclosureDocument({ name: 'COJ', layoutKey: 'coj_iowa' })).toBe(false);
    expect(isDisclosureDocument({ name: 'ACH', layoutKey: 'ach_authorization' })).toBe(false);
  });
  it('12pt unless the value is too wide for its box', () => {
    const measure = (t: string, s: number) => t.length * s * 0.5;
    expect(pearSignWidthFitFontSize('19,416.20', 200, measure, 12)).toBe(12);
    expect(pearSignWidthFitFontSize('A VERY LONG MERCHANT NAME LLC', 120, measure, 12)).toBeLessThan(12);
  });
});
