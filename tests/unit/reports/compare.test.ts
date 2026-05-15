import { describe, it, expect } from "vitest";
import {
  computeCompareRange,
  computeCompareAsOf,
  pctChange,
  formatPctChange,
  parseCompareMode,
  isCompareMode,
} from "@/lib/reports/compare";

describe("computeCompareRange", () => {
  it("returns identity for mode=none", () => {
    const r = {
      start: new Date("2026-05-01T00:00:00Z"),
      end: new Date("2026-05-31T23:59:59Z"),
    };
    expect(computeCompareRange(r, "none")).toEqual(r);
  });

  it("previous-year shifts by exactly 1 year", () => {
    const r = {
      start: new Date("2026-05-01T00:00:00Z"),
      end: new Date("2026-05-31T23:59:59Z"),
    };
    const prev = computeCompareRange(r, "previous-year");
    expect(prev.start.toISOString()).toBe("2025-05-01T00:00:00.000Z");
    expect(prev.end.toISOString()).toBe("2025-05-31T23:59:59.000Z");
  });

  it("previous-period of a 31-day month shifts back by 31 days", () => {
    const r = {
      start: new Date("2026-05-01T00:00:00Z"),
      end: new Date("2026-05-31T23:59:59Z"),
    };
    const prev = computeCompareRange(r, "previous-period");
    expect(prev.start.toISOString()).toBe("2026-03-31T00:00:00.000Z");
    expect(prev.end.toISOString()).toBe("2026-04-30T23:59:59.000Z");
  });

  it("previous-period of a 7-day week shifts back 7 days", () => {
    const r = {
      start: new Date("2026-05-04T00:00:00Z"),
      end: new Date("2026-05-10T23:59:59Z"),
    };
    const prev = computeCompareRange(r, "previous-period");
    expect(prev.start.toISOString()).toBe("2026-04-27T00:00:00.000Z");
    expect(prev.end.toISOString()).toBe("2026-05-03T23:59:59.000Z");
  });

  it("previous-period of a quarter (91 days) shifts back exactly 91 days", () => {
    // Apr 1 - Jun 30 = 91 inclusive days. Length-based shift lands
    // the prior range at Dec 31 (last day of previous year) - Mar 31.
    // This is one day longer than calendar Q1 (Jan 1 - Mar 31 = 90
    // days) because Q1 and Q2 have different lengths — the helper
    // preserves exact length rather than aligning to calendar
    // quarters. Users who want Q1-vs-Q2 should pick "Previous Year"
    // or wait for preset-aware shifting (separate PR).
    const r = {
      start: new Date("2026-04-01T00:00:00Z"),
      end: new Date("2026-06-30T23:59:59Z"),
    };
    const prev = computeCompareRange(r, "previous-period");
    expect(prev.start.toISOString().slice(0, 10)).toBe("2025-12-31");
    expect(prev.end.toISOString().slice(0, 10)).toBe("2026-03-31");
  });
});

describe("computeCompareAsOf", () => {
  it("none returns identity", () => {
    const d = new Date("2026-05-15T00:00:00Z");
    expect(computeCompareAsOf(d, "none")).toEqual(d);
  });

  it("previous-period shifts by 1 month", () => {
    const d = new Date("2026-05-15T00:00:00Z");
    expect(computeCompareAsOf(d, "previous-period").toISOString()).toBe(
      "2026-04-15T00:00:00.000Z"
    );
  });

  it("previous-year shifts by 1 year", () => {
    const d = new Date("2026-05-15T00:00:00Z");
    expect(computeCompareAsOf(d, "previous-year").toISOString()).toBe(
      "2025-05-15T00:00:00.000Z"
    );
  });

  it("previous-period across year boundary", () => {
    const d = new Date("2026-01-15T00:00:00Z");
    expect(computeCompareAsOf(d, "previous-period").toISOString()).toBe(
      "2025-12-15T00:00:00.000Z"
    );
  });
});

describe("pctChange", () => {
  it("returns 100% growth on doubling", () => {
    expect(pctChange(200, 100)).toBe(100);
  });

  it("returns negative when current < previous", () => {
    expect(pctChange(80, 100)).toBe(-20);
  });

  it("returns 0 when equal", () => {
    expect(pctChange(100, 100)).toBe(0);
  });

  it("returns null when previous is 0 (no divide by zero)", () => {
    expect(pctChange(100, 0)).toBeNull();
  });

  it("handles negative previous values correctly (uses absolute value)", () => {
    // Going from -100 to -50 is a 50% improvement.
    expect(pctChange(-50, -100)).toBe(50);
  });
});

describe("formatPctChange", () => {
  it("formats positive change with +", () => {
    expect(formatPctChange(9.1)).toBe("+9.1%");
  });
  it("formats negative change with -", () => {
    expect(formatPctChange(-9.1)).toBe("-9.1%");
  });
  it("renders ' —' for null (no previous data)", () => {
    expect(formatPctChange(null)).toBe("—");
  });
  it("rounds to 1 decimal", () => {
    expect(formatPctChange(12.345)).toBe("+12.3%");
  });
  it("renders near-zero as 0.0%", () => {
    expect(formatPctChange(0.001)).toBe("0.0%");
  });
});

describe("parseCompareMode / isCompareMode", () => {
  it("parses valid modes", () => {
    expect(parseCompareMode({ compare: "previous-period" })).toBe("previous-period");
    expect(parseCompareMode({ compare: "previous-year" })).toBe("previous-year");
  });
  it("falls back to none for missing or invalid", () => {
    expect(parseCompareMode({})).toBe("none");
    expect(parseCompareMode({ compare: "garbage" })).toBe("none");
    expect(parseCompareMode({ compare: "none" })).toBe("none");
  });
  it("isCompareMode guards string union correctly", () => {
    expect(isCompareMode("none")).toBe(true);
    expect(isCompareMode("previous-period")).toBe(true);
    expect(isCompareMode("previous-year")).toBe(true);
    expect(isCompareMode("yesterday")).toBe(false);
  });
});
