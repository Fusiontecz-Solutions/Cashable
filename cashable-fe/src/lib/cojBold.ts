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

/** Default look: every filled value bold (names, addresses, venue, amounts and dates). */
export const COJ_BOLD_DEFAULT = COJ_BOLD_GROUPS.map(([g]) => g as string);

/** "merchant,judgment" → those groups; empty → the default look; "none" → none. */
export function cojBoldSet(raw: unknown): Set<string> {
    const s = String(raw ?? "").trim().toLowerCase();
    if (!s) return new Set(COJ_BOLD_DEFAULT);
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

/** Typed COJ "Line spacing" (same choices as the server). */
export const COJ_LINE_SPACINGS = [
    ["normal", "Normal"],
    ["more", "More (+15%)"],
    ["wide", "Wide (+30%)"],
    ["double", "Double"],
] as const;

export const isCojLineSpacingKey = (key: string): boolean => /__coj\d+__coj_line_spacing$/.test(key) || key === "coj_line_spacing";

/**
 * A New York COJ (layout key or template name: "coj_ny_merchant", "COJ — NY Business only", …).
 * NY COJs are PDF only: downloaded from the COJ editor and emailed, never sent through BoldSign.
 */
export function isNewYorkCojTemplate(...names: Array<string | null | undefined>): boolean {
    return names.some((n) => {
        const k = String(n ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
        return /(^|_)coj(_|$)/.test(k) && (/(^|_)ny(_|$)/.test(k) || k.includes("new_york"));
    });
}
