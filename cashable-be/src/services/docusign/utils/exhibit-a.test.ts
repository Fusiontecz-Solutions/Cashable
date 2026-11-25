jest.mock('puppeteer', () => ({ __esModule: true, default: {} }));
import { exhibitARowValue } from './build-envelope-from-layout';

describe('Exhibit A row on the contract', () => {
  it('prints "<company> — <address>" only when the company has an address', () => {
    const v = { exhibit_a_value_1: 'SLJ INVESTMENTS CORPORATION', exhibit_a_address_1: '123 MAIN ST, NORFOLK, VA 23510', exhibit_a_value_2: 'COZY SKATE COMPANY' };
    expect(exhibitARowValue('exhibit_a_value_1', v)).toBe('SLJ INVESTMENTS CORPORATION — 123 MAIN ST, NORFOLK, VA 23510');
    expect(exhibitARowValue('exhibit_a_value_2', v)).toBeNull();
    expect(exhibitARowValue('client_legal_name', v)).toBeNull();
  });
});
