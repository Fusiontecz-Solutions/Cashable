jest.mock('puppeteer', () => ({ __esModule: true, default: {} }));
import { achDebitDayName } from './build-envelope-from-layout';

// Noon Eastern on each weekday of the week of Monday 2026-11-23.
const at = (ymd: string) => new Date(`${ymd}T17:00:00Z`);

describe('achDebitDayName (3 business days after today, Eastern time)', () => {
  it.each([
    ['2026-11-23', 'THURSDAY'], // Monday
    ['2026-11-24', 'FRIDAY'], // Tuesday
    ['2026-11-25', 'MONDAY'], // Wednesday
    ['2026-11-26', 'TUESDAY'], // Thursday
    ['2026-11-27', 'WEDNESDAY'], // Friday
    ['2026-11-28', 'WEDNESDAY'], // Saturday
    ['2026-11-29', 'WEDNESDAY'], // Sunday
  ])('%s → %s', (ymd, day) => {
    expect(achDebitDayName(at(ymd))).toBe(day);
  });
  it('uses the Eastern date, not UTC (Monday 9 PM ET is already Tuesday in UTC)', () => {
    expect(achDebitDayName(new Date('2026-11-24T02:00:00Z'))).toBe('THURSDAY');
  });
});

describe('"On the following days" line: weekly deals only', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { prefillFieldsToValueMap } = require('./build-envelope-from-layout');
  it('weekly deals get the day and the daily fallback = remit ÷ 5; a typed day wins', () => {
    const weekly = prefillFieldsToValueMap([
      { id: 'frequency', value: 'Weekly' },
      { id: 'remittance', value: '8,000.00' },
    ]);
    expect(weekly.ach_following_days_day).toMatch(/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)$/);
    expect(weekly.ach_following_days).toMatch(/Daily ACH of \$1,600\.00$/);
    const typed = prefillFieldsToValueMap([{ id: 'frequency', value: 'Weekly' }, { id: 'ach_following_days_day', value: 'MONDAY' }]);
    expect(typed.ach_following_days_day).toBe('MONDAY');
  });
  it('a stale amount in the standard sentence is replaced with the current remit ÷ 5', () => {
    const v = prefillFieldsToValueMap([
      { id: 'frequency', value: 'Weekly' },
      { id: 'remittance', value: '2,840.00' },
      { id: 'ach_following_days', value: '- IF A WEEKLY ACH BOUNCES OR IS UNCOLLECTED, THE WEEKLY ACH WILL CHANGE TO DAILY ACH OF $596.00' },
    ]);
    expect(v.ach_following_days).toMatch(/Daily ACH of \$568\.00$/);
  });
  it('daily deals print neither the sentence nor the day', () => {
    const daily = prefillFieldsToValueMap([
      { id: 'frequency', value: 'Daily' },
      { id: 'remittance', value: '500.00' },
      { id: 'ach_following_days', value: '- If a Weekly ACH bounces or is uncollected, the Weekly ACH will change to Daily ACH of $' },
      { id: 'ach_following_days_day', value: 'MONDAY' },
    ]);
    expect(daily.ach_following_days).toBe('');
    expect(daily.ach_following_days_day).toBe('');
  });
});

describe('"On the following days" tick boxes', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { prefillFieldsToValueMap } = require('./build-envelope-from-layout');
  it('daily deals tick Monday thru Friday when no box is ticked', () => {
    const v = prefillFieldsToValueMap([{ id: 'frequency', value: 'Daily' }]);
    expect(v.ach_days_mon_fri_check).toBe('X');
  });
  it('a box the team ticked wins, and weekly deals tick none', () => {
    const seven = prefillFieldsToValueMap([{ id: 'frequency', value: 'Daily' }, { id: 'ach_days_seven_check', value: 'X' }]);
    expect(seven.ach_days_mon_fri_check ?? '').toBe('');
    expect(seven.ach_days_seven_check).toBe('X');
    const weekly = prefillFieldsToValueMap([{ id: 'frequency', value: 'Weekly' }]);
    expect(weekly.ach_days_mon_fri_check ?? '').toBe('');
  });
});
