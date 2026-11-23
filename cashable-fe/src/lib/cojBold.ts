/** Typed COJ "Bold text": which CRM value groups print bold (same groups as the server). */
export const COJ_BOLD_GROUPS = [
    ["plaintiff", "Plaintiff"],
    ["merchant", "Merchant name(s)"],
    ["owner", "Owner name"],
    ["address", "Addresses"],
    ["place", "State / County"],
    ["amount", "Amounts"],
    ["date", "Dates"],
] as const;

/** Review key of a COJ's bold setting, e.g. d3__coj1__coj_bold. */
export const isCojBoldKey = (key: string): boolean => /__coj\d+__coj_bold$/.test(key) || key === "coj_bold";

/** "merchant,amount" → those groups; empty → all (the default look); "none" → none. */
export function cojBoldSet(raw: unknown): Set<string> {
    const s = String(raw ?? "").trim().toLowerCase();
    if (!s) return new Set(COJ_BOLD_GROUPS.map(([g]) => g));
    return new Set(s.split(/[\s,;]+/).filter((g) => COJ_BOLD_GROUPS.some(([k]) => k === g)));
}

/** Toggle one group; returns the stored value ("none" when nothing is bold). */
export function toggleCojBold(raw: unknown, group: string): string {
    const next = cojBoldSet(raw);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    return COJ_BOLD_GROUPS.map(([k]) => k).filter((k) => next.has(k)).join(",") || "none";
}
