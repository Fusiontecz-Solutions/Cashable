/** Typed COJ "Bold text": which CRM value groups print bold (same groups as the server). */
export const COJ_BOLD_GROUPS = [
    ["plaintiff", "Plaintiff"],
    ["merchant", "Business name"],
    ["additional", "Additional names"],
    ["owner", "Owner name"],
    ["owner_address", "Owner address"],
    ["business_address", "Business address"],
    ["state", "State"],
    ["county", "County"],
    ["purchase", "Purchased amount"],
    ["judgment", "Judgment total"],
    ["date", "Dates"],
] as const;

/** Groups of the first version of this setting, still accepted in saved values. */
const LEGACY: Record<string, string[]> = {
    address: ["owner_address", "business_address"],
    place: ["state", "county"],
    amount: ["purchase", "judgment"],
};
const NEW_ONLY = new Set(["additional", "owner_address", "business_address", "state", "county", "purchase", "judgment"]);

/** Review key of a COJ's bold setting, e.g. d3__coj1__coj_bold. */
export const isCojBoldKey = (key: string): boolean => /__coj\d+__coj_bold$/.test(key) || key === "coj_bold";

/** "merchant,judgment" → those groups; empty → all (the default look); "none" → none. */
export function cojBoldSet(raw: unknown): Set<string> {
    const s = String(raw ?? "").trim().toLowerCase();
    if (!s) return new Set(COJ_BOLD_GROUPS.map(([g]) => g));
    const ids = s.split(/[\s,;]+/).filter(Boolean);
    // Saved by the first version (7 groups): "merchant" covered the additional names too.
    const legacy = ids.some((g) => g in LEGACY) || (ids.includes("merchant") && !ids.some((g) => NEW_ONLY.has(g)));
    const out = new Set<string>();
    for (const g of ids) for (const x of LEGACY[g] ?? [g]) if (COJ_BOLD_GROUPS.some(([k]) => k === x)) out.add(x);
    if (legacy && out.has("merchant")) out.add("additional");
    return out;
}

/** Toggle one group; returns the stored value ("none" when nothing is bold). */
export function toggleCojBold(raw: unknown, group: string): string {
    const next = cojBoldSet(raw);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    return COJ_BOLD_GROUPS.map(([k]) => k).filter((k) => next.has(k)).join(",") || "none";
}
