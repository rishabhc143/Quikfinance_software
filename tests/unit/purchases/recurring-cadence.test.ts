import { describe, it, expect } from "vitest";
import { computeNextOccurrence } from "@/lib/purchases/recurring";

/**
 * Tests for the recurring-occurrence cadence math (pure function).
 *
 * The cron actions wrap this with DB I/O — those are integration-
 * tested via the Playwright lifecycle. Here we just pin down the
 * date arithmetic for every frequency the schema accepts.
 *
 * The Purchases models persist lowercase frequency strings
 * ("weekly", "monthly", etc.), unlike Sales which uses uppercase
 * ("WEEKLY"). The helper accepts both casings.
 */

describe("computeNextOccurrence — daily", () => {
  it("advances by 1 day with intervalN=1", () => {
    const r = computeNextOccurrence(new Date("2026-05-10"), "daily", 1);
    expect(r.toISOString().slice(0, 10)).toBe("2026-05-11");
  });
  it("advances by 3 days with intervalN=3", () => {
    const r = computeNextOccurrence(new Date("2026-05-10"), "daily", 3);
    expect(r.toISOString().slice(0, 10)).toBe("2026-05-13");
  });
});

describe("computeNextOccurrence — weekly", () => {
  it("advances by 7 days", () => {
    const r = computeNextOccurrence(new Date("2026-05-10"), "weekly", 1);
    expect(r.toISOString().slice(0, 10)).toBe("2026-05-17");
  });
  it("advances by 14 days with intervalN=2", () => {
    const r = computeNextOccurrence(new Date("2026-05-10"), "weekly", 2);
    expect(r.toISOString().slice(0, 10)).toBe("2026-05-24");
  });
});

describe("computeNextOccurrence — monthly", () => {
  it("advances by 1 month", () => {
    const r = computeNextOccurrence(new Date("2026-05-10"), "monthly", 1);
    expect(r.toISOString().slice(0, 10)).toBe("2026-06-10");
  });
  it("handles year boundary", () => {
    const r = computeNextOccurrence(new Date("2026-12-15"), "monthly", 1);
    expect(r.toISOString().slice(0, 10)).toBe("2027-01-15");
  });
});

describe("computeNextOccurrence — quarterly", () => {
  it("advances by 3 months with intervalN=1", () => {
    const r = computeNextOccurrence(new Date("2026-05-10"), "quarterly", 1);
    expect(r.toISOString().slice(0, 10)).toBe("2026-08-10");
  });
});

describe("computeNextOccurrence — yearly", () => {
  it("advances by 1 year", () => {
    const r = computeNextOccurrence(new Date("2026-05-10"), "yearly", 1);
    expect(r.toISOString().slice(0, 10)).toBe("2027-05-10");
  });
});

describe("computeNextOccurrence — casing", () => {
  it("accepts UPPERCASE frequency strings", () => {
    const r = computeNextOccurrence(new Date("2026-05-10"), "MONTHLY", 1);
    expect(r.toISOString().slice(0, 10)).toBe("2026-06-10");
  });
});

describe("computeNextOccurrence — edge cases", () => {
  it("treats intervalN<1 as 1", () => {
    const r = computeNextOccurrence(new Date("2026-05-10"), "weekly", 0);
    expect(r.toISOString().slice(0, 10)).toBe("2026-05-17");
  });
  it("unknown frequency falls back to +1 day (avoids infinite loops)", () => {
    const r = computeNextOccurrence(
      new Date("2026-05-10"),
      "fortnightly" as unknown as "weekly",
      1
    );
    expect(r.toISOString().slice(0, 10)).toBe("2026-05-11");
  });
});
