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

describe('Exhibit A Tax ID boxes', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { exhibitATaxIdRow, isFillAtSigningTabRef, buildEnvelopeFromLayouts } = require('./build-envelope-from-layout');
  it('recognises the Tax ID box of each row (variable, label, unique tab label)', () => {
    expect(exhibitATaxIdRow('exhibit_a_tax_id_3')).toBe(3);
    expect(exhibitATaxIdRow('exhibit_a_tax_id_10__p17_exhibit_a_tax_10')).toBe(10);
    expect(exhibitATaxIdRow('exhibit_a_value_3')).toBeNull();
    expect(exhibitATaxIdRow('security_tax_ein')).toBeNull();
  });
  it('is a box the merchant fills at signing', () => {
    expect(isFillAtSigningTabRef({ tabLabel: 'exhibit_a_tax_id_2__p17_exhibit_a_tax_2' })).toBe(true);
  });
  it('appears only on rows that list a company, and is required', () => {
    const layout = {
      key: 'contract',
      placements: [1, 2, 3].map((n) => ({
        id: `exhibit_a_tax_${n}`, type: 'text', variable: `exhibit_a_tax_id_${n}`, sourceTabLabel: `exhibit_a_tax_id_${n}`,
        documentId: '1', pageNumber: '17', x: '405', y: String(120 + n * 26), width: '145', height: '18', signerRole: 'Signer', optional: true,
      })),
    };
    const out = buildEnvelopeFromLayouts({
      mergedDocument: { name: 'Contract', documentBase64: 'eA==' },
      layouts: [layout],
      values: { exhibit_a_value_1: 'ABC LLC', exhibit_a_value_2: 'XYZ INC' },
      signers: [{ roleName: 'Signer', email: 'a@b.c', name: 'A' }],
    });
    const tabs = JSON.stringify(out);
    expect(tabs).toContain('exhibit_a_tax_id_1');
    expect(tabs).toContain('exhibit_a_tax_id_2');
    expect(tabs).not.toContain('exhibit_a_tax_id_3');
  });
});
