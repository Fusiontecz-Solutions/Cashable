import { fullUsStateName } from './usStateNames';

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
