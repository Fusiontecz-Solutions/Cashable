import { cojBoldGroups, cojInputs, renderTypedCoj, COJ_BOLD_ALL } from './coj-typed-document';

describe('COJ bold text setting', () => {
  it('parses the setting: unset = all bold, "none" = none', () => {
    expect([...cojBoldGroups('')].join(',')).toBe(COJ_BOLD_ALL);
    expect(cojBoldGroups('none').size).toBe(0);
    expect([...cojBoldGroups('merchant,owner_address,judgment')]).toEqual(['merchant', 'owner_address', 'judgment']);
  });
  it('still reads values saved with the first 7 groups', () => {
    expect([...cojBoldGroups('merchant,amount')].sort()).toEqual(['additional', 'judgment', 'merchant', 'purchase']);
    expect([...cojBoldGroups('owner,place,address')].sort()).toEqual(['business_address', 'county', 'owner', 'owner_address', 'state']);
  });
  it('is a Review input on every COJ and renders with groups switched off', async () => {
    const values = {
      business_name_with_dba: 'ACME LLC', coj_additional_names: 'PEOPLEFIRST MANAGEMENT', owner1_guarantor_name: 'JANE DOE',
      purchase_amount: '20000', agreement_date: '11/23/2026', owner_state: 'NY', owner_county: 'Kings', coj_bold: 'merchant,state',
    };
    for (const kind of ['coj_iowa', 'coj_ny_business', 'coj_ny_general', 'coj_ny_merchant'] as const) {
      expect(cojInputs(kind, values).find((i) => i.variable === 'coj_bold')?.value).toBe('merchant,state');
      const out = await renderTypedCoj(kind, values);
      expect(out.pdf.length).toBeGreaterThan(1000);
    }
  });
});
