// The layout builder transitively imports the puppeteer letter renderer (ESM), which
// ts-jest cannot load; it is irrelevant to template generation.
jest.mock('../pdf/letterHtmlToPdf.service', () => ({}));

import { getDocumentLayout } from '../docusign/layouts/document-layout.registry';
import {
  PEARSIGN_OWNER1_ROLE_ID,
  PEARSIGN_OWNER2_ROLE_ID,
  buildPearSignTemplateSpec,
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
