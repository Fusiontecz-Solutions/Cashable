import { pairWidgetValuesWithLabels } from "./claude-pdf-extraction.service";
import { parseCalendarDate } from "../utils/parseCalendarDate";
import { sanitizeEin } from "../services/einSanitizer";

describe("pairWidgetValuesWithLabels", () => {
    // Layout from a real e-signed application: label printed top-left of each box, value widget below.
    const items = [
        { s: "Business Start Date", x: 328, y: 683 },
        { s: "Tax ID Number", x: 364, y: 662 },
        { s: "State Incorporated", x: 489, y: 662 },
        { s: "OWNER / PARTNER 1", x: 60, y: 320 },
        { s: "% Ownership", x: 410, y: 307 },
        { s: "Social Security No.", x: 42, y: 281 },
        { s: "OWNER / PARTNER 2", x: 60, y: 200 },
        { s: "Social Security No.", x: 42, y: 160 },
    ];
    const widget = (rect: number[], fieldValue: string) => ({
        subtype: "Widget",
        fieldType: "Tx",
        fieldName: "page0_field",
        fieldValue,
        rect,
    });

    it("pairs each typed value with its printed label, never the neighbouring label", () => {
        const lines = pairWidgetValuesWithLabels(items, [
            widget([324, 668, 436, 681], "4/11/2016"),
            widget([360, 646, 479, 660], "81-2232158"),
            widget([485, 646, 576, 660], "TX"),
            widget([440, 289, 486, 306], "100"),
            widget([38, 265, 151, 279], "000-00-1234"),
            widget([38, 144, 151, 158], ""),
        ]);
        expect(lines).toEqual([
            "Business Start Date: 4/11/2016",
            "Tax ID Number: 81-2232158",
            "State Incorporated: TX",
            "OWNER / PARTNER 1 - % Ownership: 100",
            "OWNER / PARTNER 1 - Social Security No.: 000-00-1234",
        ]);
    });
});

describe("parseCalendarDate", () => {
    it.each(["4/11/2016", "04-11-2016", "2016-04-11", "2016-04-11T00:00:00.000Z"])(
        "%s stays Apr 11 in Eastern Time",
        (raw) => {
            const d = parseCalendarDate(raw)!;
            expect(d.toISOString()).toBe("2016-04-11T12:00:00.000Z");
            expect(d.toLocaleDateString("en-US", { timeZone: "America/New_York" })).toBe("4/11/2016");
        },
    );
    it("rejects junk", () => {
        expect(parseCalendarDate("DateBusiness")).toBeNull();
        expect(parseCalendarDate("2/30/2020")).toBeNull();
    });
});

describe("EIN guard", () => {
    it("never stores a label as an EIN", () => {
        expect(sanitizeEin("DateBusiness")).toBeNull();
        expect(sanitizeEin("81-2232158")).toBe("81-2232158");
    });
});
