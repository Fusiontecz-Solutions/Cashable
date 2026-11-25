/**
 * The CRM runs on US Eastern Time: every "today", day boundary and printed date on the server
 * follows New York time (DST-aware), whatever time zone the host machine is set to.
 * Imported first in src/index.ts, before anything reads the clock. APP_TIMEZONE overrides it.
 */
export const CRM_TIMEZONE = String(process.env.APP_TIMEZONE || 'America/New_York').trim() || 'America/New_York';
process.env.TZ = CRM_TIMEZONE;
