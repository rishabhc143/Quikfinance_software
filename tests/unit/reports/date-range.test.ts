import { describe, it, expect } from "vitest";
import {
  REPORT_PRESETS,
  PRESET_LABEL,
  resolvePreset,
  parseRangeFromSearchParams,
  rangeToSearchParams,
  formatRangeLabel,
  isReportPreset,
} from "@/lib/reports/date-range";

/**
 * REPORTS-INFRA — Pin the date-range helpers' boundary semantics.
 * Every report's date filter rides on these; a quiet drift here
 * silently distorts every report at once.
 */

// Anchor: Wed 2026-05-13 (chosen so quarters, months, weeks all
// give different distinguishable answers).
const ANCHOR = new Date(Date.UTC(2026, 4, 13, 12, 0, 0));

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describe("REPORT_PRESETS", () => {
  it("includes all 13 canonical presets", () => {
    expect(REPORT_PRESETS).toHaveLength(13);
  });

  it("every preset has a label", () => {
    for (const p of REPORT_PRESETS) {
      expect(PRESET_LABEL[p]).toBeTruthy();
    }
  });

  it("isReportPreset accepts canonical values, rejects others", () => {
    expect(isReportPreset("this-month")).toBe(true);
    expect(isReportPreset("custom")).toBe(true);
    expect(isReportPreset("this_month")).toBe(false);
    expect(isReportPreset("")).toBe(false);
    expect(isReportPreset("THIS-MONTH")).toBe(false);
  });
});

describe("resolvePreset — calendar-day boundaries", () => {
  it("today is the current calendar day, 00:00 to 23:59.999", () => {
    const r = resolvePreset("today", ANCHOR, 1)!;
    expect(iso(r.start)).toBe("2026-05-13");
    expect(iso(r.end)).toBe("2026-05-13");
    expect(r.start.getUTCHours()).toBe(0);
    expect(r.end.getUTCMilliseconds()).toBe(999);
  });

  it("yesterday is the previous calendar day", () => {
    const r = resolvePreset("yesterday", ANCHOR, 1)!;
    expect(iso(r.start)).toBe("2026-05-12");
    expect(iso(r.end)).toBe("2026-05-12");
  });
});

describe("resolvePreset — weekly boundaries (Monday-start)", () => {
  it("this-week wraps from Monday to Sunday", () => {
    // 2026-05-13 is a Wed. Monday is 2026-05-11, Sunday 2026-05-17.
    const r = resolvePreset("this-week", ANCHOR, 1)!;
    expect(iso(r.start)).toBe("2026-05-11");
    expect(iso(r.end)).toBe("2026-05-17");
  });

  it("last-week is the previous Monday→Sunday", () => {
    const r = resolvePreset("last-week", ANCHOR, 1)!;
    expect(iso(r.start)).toBe("2026-05-04");
    expect(iso(r.end)).toBe("2026-05-10");
  });
});

describe("resolvePreset — monthly boundaries", () => {
  it("this-month spans the full calendar month", () => {
    const r = resolvePreset("this-month", ANCHOR, 1)!;
    expect(iso(r.start)).toBe("2026-05-01");
    expect(iso(r.end)).toBe("2026-05-31");
  });

  it("last-month rolls back across the boundary", () => {
    const r = resolvePreset("last-month", ANCHOR, 1)!;
    expect(iso(r.start)).toBe("2026-04-01");
    expect(iso(r.end)).toBe("2026-04-30");
  });

  it("last-month from Jan rolls to Dec of prev year", () => {
    const jan = new Date(Date.UTC(2026, 0, 15));
    const r = resolvePreset("last-month", jan, 1)!;
    expect(iso(r.start)).toBe("2025-12-01");
    expect(iso(r.end)).toBe("2025-12-31");
  });
});

describe("resolvePreset — quarterly boundaries", () => {
  it("this-quarter from May 13 is Q2 (Apr-Jun)", () => {
    const r = resolvePreset("this-quarter", ANCHOR, 1)!;
    expect(iso(r.start)).toBe("2026-04-01");
    expect(iso(r.end)).toBe("2026-06-30");
  });

  it("last-quarter from May 13 is Q1 (Jan-Mar)", () => {
    const r = resolvePreset("last-quarter", ANCHOR, 1)!;
    expect(iso(r.start)).toBe("2026-01-01");
    expect(iso(r.end)).toBe("2026-03-31");
  });

  it("last-quarter from January rolls to Q4 of prev year", () => {
    const jan = new Date(Date.UTC(2026, 0, 15));
    const r = resolvePreset("last-quarter", jan, 1)!;
    expect(iso(r.start)).toBe("2025-10-01");
    expect(iso(r.end)).toBe("2025-12-31");
  });
});

describe("resolvePreset — yearly boundaries", () => {
  it("this-year is Jan 1 – Dec 31 of current calendar year", () => {
    const r = resolvePreset("this-year", ANCHOR, 1)!;
    expect(iso(r.start)).toBe("2026-01-01");
    expect(iso(r.end)).toBe("2026-12-31");
  });

  it("last-year is prev calendar year", () => {
    const r = resolvePreset("last-year", ANCHOR, 1)!;
    expect(iso(r.start)).toBe("2025-01-01");
    expect(iso(r.end)).toBe("2025-12-31");
  });
});

describe("resolvePreset — fiscal year (April-start)", () => {
  it("this-fiscal-year from May 13 (post-April) is FY26-27", () => {
    const r = resolvePreset("this-fiscal-year", ANCHOR, 4)!;
    expect(iso(r.start)).toBe("2026-04-01");
    expect(iso(r.end)).toBe("2027-03-31");
  });

  it("this-fiscal-year from Feb (pre-April) is FY25-26", () => {
    const feb = new Date(Date.UTC(2026, 1, 15));
    const r = resolvePreset("this-fiscal-year", feb, 4)!;
    expect(iso(r.start)).toBe("2025-04-01");
    expect(iso(r.end)).toBe("2026-03-31");
  });

  it("last-fiscal-year from May 13 is FY25-26", () => {
    const r = resolvePreset("last-fiscal-year", ANCHOR, 4)!;
    expect(iso(r.start)).toBe("2025-04-01");
    expect(iso(r.end)).toBe("2026-03-31");
  });
});

describe("resolvePreset — calendar-year FY (Jan start)", () => {
  it("this-fiscal-year equals this-year when start=Jan", () => {
    const fyR = resolvePreset("this-fiscal-year", ANCHOR, 1)!;
    const yR = resolvePreset("this-year", ANCHOR, 1)!;
    expect(iso(fyR.start)).toBe(iso(yR.start));
    expect(iso(fyR.end)).toBe(iso(yR.end));
  });
});

describe("resolvePreset — custom is null", () => {
  it("returns null for custom (caller supplies dates)", () => {
    expect(resolvePreset("custom", ANCHOR, 4)).toBeNull();
  });
});

describe("parseRangeFromSearchParams", () => {
  it("uses default preset when no params are passed", () => {
    const r = parseRangeFromSearchParams(
      {},
      { now: ANCHOR, fiscalYearStartMonth: 4, defaultPreset: "this-month" }
    );
    expect(r.preset).toBe("this-month");
    expect(iso(r.range.start)).toBe("2026-05-01");
    expect(iso(r.range.end)).toBe("2026-05-31");
  });

  it("resolves a named preset", () => {
    const r = parseRangeFromSearchParams(
      { preset: "this-fiscal-year" },
      { now: ANCHOR, fiscalYearStartMonth: 4 }
    );
    expect(r.preset).toBe("this-fiscal-year");
    expect(iso(r.range.start)).toBe("2026-04-01");
    expect(iso(r.range.end)).toBe("2027-03-31");
  });

  it("accepts custom + explicit from/to", () => {
    const r = parseRangeFromSearchParams(
      { preset: "custom", from: "2026-01-15", to: "2026-02-20" },
      { now: ANCHOR }
    );
    expect(r.preset).toBe("custom");
    expect(iso(r.range.start)).toBe("2026-01-15");
    expect(iso(r.range.end)).toBe("2026-02-20");
    expect(r.range.end.getUTCHours()).toBe(23);
  });

  it("legacy from/to (no preset) is treated as custom", () => {
    const r = parseRangeFromSearchParams(
      { from: "2026-03-01", to: "2026-03-31" },
      { now: ANCHOR }
    );
    expect(r.preset).toBe("custom");
    expect(iso(r.range.start)).toBe("2026-03-01");
    expect(iso(r.range.end)).toBe("2026-03-31");
  });

  it("falls back to default when custom is requested but dates are missing", () => {
    const r = parseRangeFromSearchParams(
      { preset: "custom" },
      { now: ANCHOR, defaultPreset: "this-month" }
    );
    expect(r.preset).toBe("this-month");
    expect(iso(r.range.start)).toBe("2026-05-01");
  });

  it("ignores an unknown preset and falls back", () => {
    const r = parseRangeFromSearchParams(
      { preset: "yolo" as string },
      { now: ANCHOR, defaultPreset: "this-year" }
    );
    expect(r.preset).toBe("this-year");
    expect(iso(r.range.start)).toBe("2026-01-01");
  });

  it("ignores a malformed custom date and falls back", () => {
    const r = parseRangeFromSearchParams(
      { preset: "custom", from: "13/05/2026", to: "20/05/2026" },
      { now: ANCHOR, defaultPreset: "this-month" }
    );
    expect(r.preset).toBe("this-month");
  });
});

describe("rangeToSearchParams (URL round-trip)", () => {
  it("a preset round-trips to itself", () => {
    const r = resolvePreset("this-quarter", ANCHOR, 1)!;
    const qs = rangeToSearchParams("this-quarter", r);
    const parsed = parseRangeFromSearchParams(
      Object.fromEntries(qs.entries()),
      { now: ANCHOR }
    );
    expect(parsed.preset).toBe("this-quarter");
    expect(iso(parsed.range.start)).toBe(iso(r.start));
    expect(iso(parsed.range.end)).toBe(iso(r.end));
  });

  it("custom preserves from/to", () => {
    const r = {
      start: new Date(Date.UTC(2025, 6, 1)),
      end: new Date(Date.UTC(2025, 8, 30, 23, 59, 59, 999)),
    };
    const qs = rangeToSearchParams("custom", r);
    expect(qs.get("preset")).toBe("custom");
    expect(qs.get("from")).toBe("2025-07-01");
    expect(qs.get("to")).toBe("2025-09-30");
  });
});

describe("formatRangeLabel", () => {
  it("renders 'Mon DD, YYYY — Mon DD, YYYY'", () => {
    const r = resolvePreset("this-fiscal-year", ANCHOR, 4)!;
    expect(formatRangeLabel(r)).toBe("Apr 01, 2026 — Mar 31, 2027");
  });
});
