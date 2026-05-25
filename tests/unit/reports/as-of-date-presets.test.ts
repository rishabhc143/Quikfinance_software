import { describe, it, expect } from "vitest";
import {
  resolveAsOfPreset,
  parseAsOfPreset,
  formatAsOfYmd,
  AS_OF_PRESET_ORDER,
  AS_OF_PRESET_LABEL,
} from "@/lib/reports/as-of-date-presets";

/**
 * Tests use a frozen "now" anchor at 2026-05-25 UTC (a Monday in
 * Indian FY 2026-27 which runs Apr 1, 2026 → Mar 31, 2027). All
 * preset-resolved dates are deterministic against this anchor.
 */
const utc = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));

const ANCHOR = utc(2026, 5, 25); // Monday, May 25, 2026

describe("lib/reports/as-of-date-presets — constants", () => {
  it("AS_OF_PRESET_ORDER lists the 11 Zoho-labelled keys in canonical order", () => {
    expect(AS_OF_PRESET_ORDER).toEqual([
      "today",
      "this-week",
      "this-month",
      "this-quarter",
      "this-year",
      "yesterday",
      "previous-week",
      "previous-month",
      "previous-quarter",
      "previous-year",
      "custom",
    ]);
  });

  it("AS_OF_PRESET_LABEL covers every key with Zoho-parity labels", () => {
    expect(AS_OF_PRESET_LABEL).toEqual({
      today: "Today",
      "this-week": "This Week",
      "this-month": "This Month",
      "this-quarter": "This Quarter",
      "this-year": "This Year",
      yesterday: "Yesterday",
      "previous-week": "Previous Week",
      "previous-month": "Previous Month",
      "previous-quarter": "Previous Quarter",
      "previous-year": "Previous Year",
      custom: "Custom",
    });
  });
});

describe("lib/reports/as-of-date-presets — resolveAsOfPreset", () => {
  it("'today' resolves to the anchor date", () => {
    const d = resolveAsOfPreset("today", 4, ANCHOR);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4); // May (0-indexed)
    expect(d.getUTCDate()).toBe(25);
  });

  it("'yesterday' resolves to one day before the anchor", () => {
    const d = resolveAsOfPreset("yesterday", 4, ANCHOR);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4);
    expect(d.getUTCDate()).toBe(24);
  });

  it("'this-month' resolves to the last day of the anchor's calendar month (May 31)", () => {
    const d = resolveAsOfPreset("this-month", 4, ANCHOR);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4); // May
    expect(d.getUTCDate()).toBe(31);
  });

  it("'previous-month' resolves to the last day of the previous calendar month (April 30)", () => {
    const d = resolveAsOfPreset("previous-month", 4, ANCHOR);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(3); // April
    expect(d.getUTCDate()).toBe(30);
  });

  it("'this-quarter' resolves to last day of current calendar quarter (Q2 → Jun 30)", () => {
    const d = resolveAsOfPreset("this-quarter", 4, ANCHOR);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5); // June
    expect(d.getUTCDate()).toBe(30);
  });

  it("'previous-quarter' resolves to last day of previous calendar quarter (Q1 → Mar 31)", () => {
    const d = resolveAsOfPreset("previous-quarter", 4, ANCHOR);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(2); // March
    expect(d.getUTCDate()).toBe(31);
  });

  it("'this-year' with fyStart=4 (India) resolves to Mar 31 of next year (FY end)", () => {
    const d = resolveAsOfPreset("this-year", 4, ANCHOR);
    expect(d.getUTCFullYear()).toBe(2027);
    expect(d.getUTCMonth()).toBe(2); // March
    expect(d.getUTCDate()).toBe(31);
  });

  it("'previous-year' with fyStart=4 (India) resolves to Mar 31 of current year (FY 2025-26 end)", () => {
    const d = resolveAsOfPreset("previous-year", 4, ANCHOR);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(2); // March
    expect(d.getUTCDate()).toBe(31);
  });

  it("'this-year' with fyStart=1 (calendar-year FY, US default) resolves to Dec 31 of anchor year", () => {
    const d = resolveAsOfPreset("this-year", 1, ANCHOR);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(11); // December
    expect(d.getUTCDate()).toBe(31);
  });

  it("'previous-year' with fyStart=1 (calendar-year FY) resolves to Dec 31 of previous year", () => {
    const d = resolveAsOfPreset("previous-year", 1, ANCHOR);
    expect(d.getUTCFullYear()).toBe(2025);
    expect(d.getUTCMonth()).toBe(11); // December
    expect(d.getUTCDate()).toBe(31);
  });

  it("'this-week' resolves to end of current Mon-Sun week (May 31, Sunday)", () => {
    // ANCHOR is Mon May 25 → this week = May 25..31, Sunday is May 31
    const d = resolveAsOfPreset("this-week", 4, ANCHOR);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4); // May
    expect(d.getUTCDate()).toBe(31);
  });

  it("'previous-week' resolves to end of previous week (May 24, Sunday)", () => {
    const d = resolveAsOfPreset("previous-week", 4, ANCHOR);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4); // May
    expect(d.getUTCDate()).toBe(24);
  });

  it("'custom' returns the anchor date as a safe fallback (caller overrides)", () => {
    const d = resolveAsOfPreset("custom", 4, ANCHOR);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4);
    expect(d.getUTCDate()).toBe(25);
  });

  it("defaults fiscalYearStartMonth to 1 (calendar year) when omitted", () => {
    const d = resolveAsOfPreset("this-year", undefined as unknown as number, ANCHOR);
    // With fyStart=1, "This Year" = Dec 31 of anchor year
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(11);
    expect(d.getUTCDate()).toBe(31);
  });
});

describe("lib/reports/as-of-date-presets — parseAsOfPreset", () => {
  it("returns the key for every valid AsOfPresetKey value", () => {
    for (const key of AS_OF_PRESET_ORDER) {
      expect(parseAsOfPreset(key)).toBe(key);
    }
  });

  it("returns null for unknown strings", () => {
    expect(parseAsOfPreset("bogus")).toBeNull();
    expect(parseAsOfPreset("THIS-YEAR")).toBeNull(); // case-sensitive
    expect(parseAsOfPreset("today ")).toBeNull(); // trailing space
  });

  it("returns null for empty / nullish values", () => {
    expect(parseAsOfPreset(null)).toBeNull();
    expect(parseAsOfPreset(undefined)).toBeNull();
    expect(parseAsOfPreset("")).toBeNull();
  });

  it("accepts string[] (Next.js search-params shape) and uses the first element", () => {
    expect(parseAsOfPreset(["this-month", "extra"])).toBe("this-month");
    expect(parseAsOfPreset(["bogus"])).toBeNull();
    expect(parseAsOfPreset([])).toBeNull();
  });
});

describe("lib/reports/as-of-date-presets — formatAsOfYmd", () => {
  it("formats a Date as YYYY-MM-DD in UTC", () => {
    expect(formatAsOfYmd(utc(2026, 5, 25))).toBe("2026-05-25");
    expect(formatAsOfYmd(utc(2026, 1, 1))).toBe("2026-01-01");
    expect(formatAsOfYmd(utc(2026, 12, 31))).toBe("2026-12-31");
  });

  it("zero-pads single-digit month and day", () => {
    expect(formatAsOfYmd(utc(2026, 3, 5))).toBe("2026-03-05");
  });
});
