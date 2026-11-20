/** US state / DC / territory postal codes → full names (legal documents spell the state out). */
export const US_STATE_NAME_BY_CODE: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  PR: 'Puerto Rico',
  GU: 'Guam',
  VI: 'U.S. Virgin Islands',
  AS: 'American Samoa',
  MP: 'Northern Mariana Islands',
};

/** "MA" / "ma" / " Ma " → "Massachusetts"; anything else (already a name, unknown) is returned trimmed. */
export function fullUsStateName(value: unknown): string {
  const v = String(value ?? '').trim();
  return US_STATE_NAME_BY_CODE[v.toUpperCase()] ?? v;
}

const US_STATE_CODE_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATE_NAME_BY_CODE).map(([code, name]) => [name.toUpperCase(), code]),
);

/** "California" / "CALIFORNIA" → "CA"; a code or anything else is returned trimmed. */
export function usStateCode(value: unknown): string {
  const v = String(value ?? '').trim();
  return US_STATE_CODE_BY_NAME[v.toUpperCase()] ?? v;
}

/**
 * Address lines use 2-letter state codes ("…, GLENDALE, CA, 91203"): a full state name in the
 * state position (a comma-separated part after the street and city) becomes its code. Empty parts
 * and doubled commas ("BOULEVARD,, GLENDALE") are removed. A city named like a state
 * ("Washington") is left alone because it sits before the state position.
 */
export function normalizeUsAddress(value: unknown): string {
  const parts = String(value ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts
    .map((p, i) => {
      if (i < 2) return p;
      // "California 91203" (state and ZIP in one part) or just "California".
      const m = /^(.*?)(\s+\d{5}(?:-\d{4})?)?$/.exec(p);
      const name = (m?.[1] ?? p).trim();
      const code = US_STATE_CODE_BY_NAME[name.toUpperCase()];
      return code ? `${code}${m?.[2] ?? ''}` : p;
    })
    .join(', ');
}
