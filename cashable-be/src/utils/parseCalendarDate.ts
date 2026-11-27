/**
 * Date-only values from applications (business start date, date of birth) have no time.
 * `new Date("2016-04-11")` is UTC midnight, which is Apr 10 8 PM in Eastern Time, so the CRM
 * showed the day before. Store them at 12:00 UTC: the same calendar day in every US time zone.
 */
export function parseCalendarDate(raw: string | null | undefined): Date | null {
    const t = String(raw ?? '').trim();
    if (!t) return null;
    const atNoon = (y: number, m: number, d: number): Date | null => {
        if (y < 100) y += y > 50 ? 1900 : 2000;
        if (m < 1 || m > 12 || d < 1 || d > 31) return null;
        const dt = new Date(Date.UTC(y, m - 1, d, 12));
        return dt.getUTCMonth() === m - 1 ? dt : null;
    };
    let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/);
    if (m) return atNoon(+m[1], +m[2], +m[3]);
    m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (m) return atNoon(+m[3], +m[1], +m[2]);
    const parsed = new Date(t);
    if (isNaN(parsed.getTime())) return null;
    return atNoon(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}
