jest.mock('puppeteer', () => ({ __esModule: true, default: {} }));
import { renderTypedCoj } from '../docusign/utils/coj-typed-document';
import { isOwnerStateFieldId, toPrefillUppercase } from '../docusign/utils/prefill-uppercase';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { contractValueCase, isDisclosureAmountValue } = jest.requireActual('./pearsign-package.service');

const values = {
  funder_name: 'CASHABLE LLC',
  owner1_guarantor_name: 'MATTHEW L MONARCHIE',
  business_name_with_dba: 'TOW BOSS TOWING & RECOVERY INC',
  owner_state: 'NY',
  owner_county: 'DUTCHESS',
  guarantor_address_full: '18 ARCADIAN PL, FISHKILL, NY, 12524',
  business_address_full: '18 ARCADIAN PL, FISHKILL, NY, 12524',
  business_county: 'DUTCHESS',
  coj_repayment_amount: '23,850.00',
  agreement_date: '11/27/2026',
};

describe('New York COJs are signed in BoldSign', () => {
  it.each(['coj_ny_merchant', 'coj_ny_general', 'coj_ny_business'] as const)(
    '%s has a signature box and an initials box on every page',
    async (kind) => {
      const { placements, pageCount } = await renderTypedCoj(kind, values);
      expect(placements.filter((p) => p.type === 'signature').length).toBeGreaterThanOrEqual(1);
      const initialPages = new Set(placements.filter((p) => p.type === 'initial').map((p) => p.pageNumber));
      expect(initialPages.size).toBe(pageCount);
    },
  );
});

describe('owner state prints in full everywhere', () => {
  it('matches owner / sworn state field ids', () => {
    for (const id of ['owner_state', 'd1_owner_state_p3', 'd2__coj1__owner_state', 'OwnerState', 'Sworn State', 'sworn_state']) {
      expect(isOwnerStateFieldId(id)).toBe(true);
    }
    expect(isOwnerStateFieldId('guarantor_address_state')).toBe(false);
    expect(isOwnerStateFieldId('business_address_state')).toBe(false);
  });
  it('template prefill and package boxes spell the state out', () => {
    expect(toPrefillUppercase('NY', 'owner_state')).toBe('NEW YORK');
    expect(toPrefillUppercase('nj', 'Sworn State')).toBe('NEW JERSEY');
    expect(contractValueCase('NY', 'd1_owner_state_p2')).toBe('NEW YORK');
    expect(contractValueCase('NY', 'd1_guarantor_address_state_p2')).toBe('NY');
  });
});

describe('disclosure amounts', () => {
  it('recognises amounts and percentages, not words', () => {
    for (const v of ['15,000.00', '0.00', '$ 15,000.00', '36.5%', '(1,200.00)']) expect(isDisclosureAmountValue(v)).toBe(true);
    for (const v of ['TOW BOSS', 'NEW YORK', '11/27/2026', '']) expect(isDisclosureAmountValue(v)).toBe(false);
  });
});
