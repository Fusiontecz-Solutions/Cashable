// The layout builder transitively imports the puppeteer letter renderer (ESM), which
// ts-jest cannot load; it is irrelevant to template generation.
jest.mock('../pdf/letterHtmlToPdf.service', () => ({}));

import { getDocumentLayout } from '../docusign/layouts/document-layout.registry';
import {
  PEARSIGN_OWNER1_ROLE_ID,
  PEARSIGN_OWNER2_ROLE_ID,
  buildPearSignTemplateSpec,
  cleanFontSize,
  cleanStyles,
  mergeStyles,
  pearSignBoxForFont,
  pearSignFitFontSize,
  pearSignPageFontSizes,
  pearSignHeightForFont,
  isPearSignIndependentKey,
  pearSignIndependentKey,
  pearSignValueKey,
  pearSignBaseKey,
  toPearSignCreateFields,
} from './pearsign-template-spec';

/**
 * The PearSign contract templates are generated from the same coordinate layout the
 * Dropbox Sign send uses. These tests pin the CRM ↔ PearSign field contract.
 */
describe('buildPearSignTemplateSpec (Cashable main contract)', () => {
  const layout = getDocumentLayout('contract');
  const one = buildPearSignTemplateSpec({ layout, owners: 1, funderName: 'F', documentLabel: 'Agreement' });
  const two = buildPearSignTemplateSpec({ layout, owners: 2, funderName: 'F', documentLabel: 'Agreement' });

  it('maps every layout placement exactly once in the 2-owner template', () => {
    expect(two.fields).toHaveLength(layout.placements.length);
    expect(new Set(two.fields.map((f) => f.placementId)).size).toBe(layout.placements.length);
  });

  it('drops the owners >= 2 placements from the 1-owner template', () => {
    const secondary = layout.placements.filter((p) => p.when).length;
    expect(one.fields).toHaveLength(layout.placements.length - secondary);
    expect(one.signerRoles).toEqual([{ roleId: PEARSIGN_OWNER1_ROLE_ID, name: 'Owner 1', order: 1 }]);
    expect(one.fields.every((f) => f.roleId === PEARSIGN_OWNER1_ROLE_ID)).toBe(true);
  });

  it('assigns secondary placements to Owner 2', () => {
    const secondaryIds = new Set(layout.placements.filter((p) => p.signerParty === 'secondary').map((p) => p.id));
    for (const f of two.fields) {
      expect(f.roleId).toBe(secondaryIds.has(f.placementId) ? PEARSIGN_OWNER2_ROLE_ID : PEARSIGN_OWNER1_ROLE_ID);
    }
  });

  it('gives unique field names whose base key is the layout variable', () => {
    for (const spec of [one, two]) {
      expect(new Set(spec.fields.map((f) => f.fieldName)).size).toBe(spec.fields.length);
      for (const f of spec.fields.filter((x) => x.variable)) {
        expect(pearSignBaseKey(f.fieldName)).toBe(f.variable);
      }
    }
  });

  it('keeps the exact layout coordinates', () => {
    const byId = new Map(layout.placements.map((p) => [p.id, p]));
    for (const f of two.fields) {
      const p = byId.get(f.placementId)!;
      expect(f.page).toBe(Number(p.pageNumber));
      expect(f.x).toBe(Math.round(Number(p.x)));
      expect(f.y).toBe(Math.round(Number(p.y)));
    }
  });

  it('marks signature / initials / fill-at-signing as signer-completed and the rest as CRM-filled', () => {
    const sig = two.fields.filter((f) => f.type === 'signature' || f.type === 'initials');
    expect(sig.length).toBeGreaterThan(0);
    expect(sig.every((f) => f.signerFilled && f.required && f.variable === null)).toBe(true);

    const fillAtSigning = two.fields.filter((f) => f.variable?.startsWith('ach_authorization_'));
    expect(fillAtSigning.length).toBe(12);
    expect(fillAtSigning.every((f) => f.signerFilled)).toBe(true);

    // signature_date is the CRM agreement date (agreement_date → signature_date), printed as text.
    const dates = two.fields.filter((f) => f.variable === 'signature_date');
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every((f) => f.type === 'text' && !f.signerFilled)).toBe(true);
  });

  it('sends positions as the nested `position` object PearSign actually honours', () => {
    const fields = toPearSignCreateFields(one);
    expect(fields[0]).toEqual(
      expect.objectContaining({ position: expect.objectContaining({ page: expect.any(Number), x: expect.any(Number) }) }),
    );
    expect(fields[0]).not.toHaveProperty('page');
    expect(fields[0]).not.toHaveProperty('variable');
  });
});

describe('pearSignBaseKey', () => {
  it.each([
    ['client_legal_name_p1', 'client_legal_name'],
    ['signature_date_p2b', 'signature_date'],
    ['exhibit_a_value_10_p17', 'exhibit_a_value_10'],
    ['signature_o2_p14c', 'signature_o2'],
  ])('%s → %s', (name, base) => expect(pearSignBaseKey(name)).toBe(base));
});

describe('independent fields (page-1 EIN)', () => {
  const contractEin = buildPearSignTemplateSpec({
    layout: getDocumentLayout('contract'),
    owners: 1,
    funderName: 'F',
    documentLabel: 'Agreement',
  }).fields.filter((f) => pearSignBaseKey(f.fieldName) === 'security_tax_ein');

  it('gives the page-1 EIN its own value key and keeps the other pages on the shared one', () => {
    const keys = contractEin.map((f) => [f.page, pearSignValueKey(f.fieldName)]);
    expect(keys).toContainEqual([1, 'security_tax_ein_p1']);
    expect(keys.filter(([page]) => page !== 1).every(([, k]) => k === 'security_tax_ein')).toBe(true);
    expect(keys.length).toBeGreaterThan(1);
  });

  it.each([
    ['security_tax_ein_p1', true],
    ['d1__security_tax_ein_p1', true],
    ['d1__security_tax_ein', false],
    ['security_tax_ein', false],
    ['security_tax_ein_p10', false],
    ['client_legal_name_p1', false],
  ])('isPearSignIndependentKey(%s) = %s', (key, expected) => expect(isPearSignIndependentKey(key)).toBe(expected));

  it('leaves non-independent fields on their layout variable', () => {
    expect(pearSignValueKey('security_tax_ein_p10')).toBe('security_tax_ein');
    expect(pearSignValueKey('client_legal_name_p1')).toBe('client_legal_name');
    expect(pearSignIndependentKey('security_tax_ein', 1)).toBe('security_tax_ein_p1');
    expect(pearSignIndependentKey('security_tax_ein', 10)).toBeNull();
  });
});

describe('font sizes', () => {
  it('accepts 6–36pt (half points) and rejects the rest', () => {
    expect(cleanFontSize(9)).toBe(9);
    expect(cleanFontSize('10.5')).toBe(10.5);
    expect(cleanFontSize(6)).toBe(6);
    expect(cleanFontSize(36)).toBe(36);
    expect(cleanFontSize(5)).toBeNull();
    expect(cleanFontSize(40)).toBeNull();
    expect(cleanFontSize(null)).toBeNull();
    expect(cleanFontSize('big')).toBeNull();
  });

  it('merges edits: a valid size sets, null clears, unknown keys are ignored', () => {
    const prev = { a: { fontSize: 9 }, b: { fontSize: 12 } };
    const next = mergeStyles(prev, { a: { fontSize: null }, c: { fontSize: 14 }, zz: { fontSize: 8 } }, (k) => k !== 'zz');
    expect(next).toEqual({ b: { fontSize: 12 }, c: { fontSize: 14 } });
    expect(cleanStyles({ ok: { fontSize: 10 }, bad: { fontSize: 2 }, 'no space': { fontSize: 10 } })).toEqual({ ok: { fontSize: 10 } });
  });

  it('grows a box only when it is too short for the size', () => {
    expect(pearSignHeightForFont(14, undefined)).toBe(14);
    expect(pearSignHeightForFont(14, 8)).toBe(14);
    expect(pearSignHeightForFont(14, 12)).toBe(16);
    expect(pearSignHeightForFont(30, 12)).toBe(30);
  });
});

describe('value font size (one consistent size per box)', () => {
  // Rough Helvetica: 0.5em per character.
  const measure = (t: string, s: number) => t.length * s * 0.5;

  it('uses 75% of the box height, capped at 10pt', () => {
    expect(pearSignFitFontSize('MA', { width: 160, height: 15 }, measure)).toBe(10);
    expect(pearSignFitFontSize('MA', { width: 160, height: 12 }, measure)).toBe(9);
    expect(pearSignFitFontSize('MA', { width: 160, height: 11 }, measure)).toBe(8.5);
  });

  it('shrinks only when the value is too wide, never below 6pt', () => {
    expect(pearSignFitFontSize('X'.repeat(40), { width: 160, height: 15 }, measure)).toBe(7.5);
    expect(pearSignFitFontSize('X'.repeat(200), { width: 60, height: 15 }, measure)).toBe(6);
  });
});

describe('one value size per page', () => {
  const measure = (t: string, s: number) => t.length * s * 0.5;

  it('gives every box on a page the same size', () => {
    const sizes = pearSignPageFontSizes(
      [
        { page: 1, width: 400, value: 'SAFE FREIGHT INC' },
        { page: 1, width: 400, value: '2530 WILSHIRE BLVD 2ND FL, SANTA MONICA, CA, 90403' },
        { page: 1, width: 238, value: 'Corporation' },
        { page: 2, width: 100, value: '45' },
      ],
      measure,
    );
    expect(new Set(sizes.slice(0, 3)).size).toBe(1);
    expect(sizes[0]).toBe(10);
    expect(sizes[3]).toBe(10);
  });

  it('lowers the whole page when one value needs it, never below 8pt; a longer one shrinks alone', () => {
    const sizes = pearSignPageFontSizes(
      [
        { page: 1, width: 400, value: 'SHORT' },
        { page: 1, width: 100, value: 'X'.repeat(22) }, // fits at 8.5
        { page: 1, width: 60, value: 'Y'.repeat(30) }, // needs < 8
      ],
      measure,
    );
    expect(sizes[0]).toBe(8);
    expect(sizes[1]).toBe(8);
    expect(sizes[2]).toBeLessThan(8);
  });

  it('ignores empty boxes and grows short boxes evenly', () => {
    expect(pearSignPageFontSizes([{ page: 1, width: 10, value: '' }, { page: 1, width: 300, value: 'A' }], measure)).toEqual([10, 10]);
    expect(pearSignBoxForFont({ y: 100, height: 10 }, 10)).toEqual({ y: 98, height: 14 });
    expect(pearSignBoxForFont({ y: 100, height: 15 }, 10)).toEqual({ y: 100, height: 15 });
  });
});
