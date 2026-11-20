// The flattened-PDF renderer pulls in the puppeteer letter service (ESM), which ts-jest cannot load.
jest.mock('../../pdf/letterHtmlToPdf.service', () => ({}));

import { withValuePrefix } from './build-envelope-from-layout';

describe('withValuePrefix (layout valuePrefix, e.g. "$" moved next to an amount)', () => {
  it('adds the prefix to a value', () => {
    expect(withValuePrefix({ valuePrefix: '$' }, '42,500.00')).toBe('$42,500.00');
  });
  it('does not double it or touch empty values', () => {
    expect(withValuePrefix({ valuePrefix: '$' }, '$42,500.00')).toBe('$42,500.00');
    expect(withValuePrefix({ valuePrefix: '$' }, '')).toBe('');
    expect(withValuePrefix({}, '42,500.00')).toBe('42,500.00');
  });
});
