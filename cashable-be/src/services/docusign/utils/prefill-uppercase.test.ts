import { shouldSkipPrefillUppercase, toPrefillUppercase } from './prefill-uppercase';

describe('prefill uppercase', () => {
  it('uppercases names and addresses', () => {
    expect(toPrefillUppercase('John Smith', 'client_name')).toBe('JOHN SMITH');
    expect(toPrefillUppercase('123 Main St', 'business_address')).toBe('123 MAIN ST');
  });

  it('skips credentials, urls, emails, and entity type', () => {
    expect(shouldSkipPrefillUppercase('achAuthorizationPassword')).toBe(true);
    expect(shouldSkipPrefillUppercase('ach_authorization_username')).toBe(true);
    expect(shouldSkipPrefillUppercase('ach_authorization_bank_portal_website')).toBe(true);
    expect(shouldSkipPrefillUppercase('client_email')).toBe(true);
    expect(shouldSkipPrefillUppercase('entity_type')).toBe(true);
    expect(toPrefillUppercase('Secret1', 'achAuthorizationPassword')).toBe('Secret1');
    expect(toPrefillUppercase('https://bank.example/login', 'achAuthorizationBankPortalWebsite')).toBe(
      'https://bank.example/login',
    );
  });
});

describe('weekly ACH note keeps sentence case', () => {
  it('prints the note as written but keeps the day in capitals', () => {
    const note = '- If a Weekly ACH bounces or is uncollected, the Weekly ACH will change to Daily ACH of $375.00';
    expect(toPrefillUppercase(note, 'ach_following_days')).toBe(note);
    expect(toPrefillUppercase('Wednesday', 'ach_following_days_day')).toBe('WEDNESDAY');
  });
});
