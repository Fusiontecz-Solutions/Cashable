import { fullUsStateName, normalizeUsAddress } from './usStateNames';

describe('fullUsStateName (COJ "STATE OF" line)', () => {
  it.each([
    ['MA', 'Massachusetts'],
    ['ny', 'New York'],
    [' Ca ', 'California'],
    ['DC', 'District of Columbia'],
    ['Massachusetts', 'Massachusetts'],
    ['', ''],
    ['XX', 'XX'],
  ])('%s → %s', (input, out) => expect(fullUsStateName(input)).toBe(out));
});

describe('normalizeUsAddress (address lines use state codes)', () => {
  it.each([
    ['535 NORTH BRAND BOULEVARD,, GLENDALE, CALIFORNIA, 91203', '535 NORTH BRAND BOULEVARD, GLENDALE, CA, 91203'],
    ['320 E STOCKER ST UNIT 213, GLENDALE, CA, 91207', '320 E STOCKER ST UNIT 213, GLENDALE, CA, 91207'],
    ['1 Main St, Albany, New York 12207', '1 Main St, Albany, NY 12207'],
    ['500 Pine St, Washington, Washington, 98101', '500 Pine St, Washington, WA, 98101'],
    ['10 Elm St, , Boston, , Massachusetts', '10 Elm St, Boston, MA'],
    ['', ''],
  ])('%s', (input, out) => expect(normalizeUsAddress(input)).toBe(out));
});
