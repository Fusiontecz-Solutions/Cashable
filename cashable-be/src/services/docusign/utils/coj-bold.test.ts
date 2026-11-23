import { cojBoldGroups, cojInputs, renderTypedCoj, COJ_BOLD_ALL } from './coj-typed-document';

describe('COJ bold text setting', () => {
  it('parses the setting: unset = all bold, "none" = none', () => {
    expect([...cojBoldGroups('')].join(',')).toBe(COJ_BOLD_ALL);
    expect(cojBoldGroups('none').size).toBe(0);
    expect([...cojBoldGroups('merchant, amount')]).toEqual(['merchant', 'amount']);
  });
  it('is a Review input on every COJ and renders with groups switched off', async () => {
    const values = { business_name_with_dba: 'ACME LLC', owner1_guarantor_name: 'JANE DOE', purchase_amount: '20000', agreement_date: '11/23/2026', owner_state: 'NY', owner_county: 'Kings', coj_bold: 'merchant' };
    for (const kind of ['coj_iowa', 'coj_ny_business', 'coj_ny_general', 'coj_ny_merchant'] as const) {
      const bold = cojInputs(kind, values).find((i) => i.variable === 'coj_bold');
      expect(bold?.value).toBe('merchant');
      const out = await renderTypedCoj(kind, values);
      expect(out.pdf.length).toBeGreaterThan(1000);
    }
  });
});
