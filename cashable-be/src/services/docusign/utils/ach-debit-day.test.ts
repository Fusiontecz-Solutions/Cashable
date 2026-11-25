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

describe('"On the following days" day box: daily and weekly deals', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { prefillFieldsToValueMap } = require('./build-envelope-from-layout');
  it('weekly deals get the day too; a typed day wins', () => {
    const weekly = prefillFieldsToValueMap([{ id: 'frequency', value: 'Weekly' }]);
    expect(weekly.ach_following_days_day).toMatch(/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)$/);
    const daily = prefillFieldsToValueMap([{ id: 'frequency', value: 'Daily' }]);
    expect(daily.ach_following_days_day).toBe(weekly.ach_following_days_day);
    const typed = prefillFieldsToValueMap([{ id: 'frequency', value: 'Weekly' }, { id: 'ach_following_days_day', value: 'MONDAY' }]);
    expect(typed.ach_following_days_day).toBe('MONDAY');
  });
});
