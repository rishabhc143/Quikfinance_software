import { describe, it, expect } from "vitest";
import { projectOccurrences } from "@/lib/cashflow/recurring-projection";

const baseProfile = {
  frequency: "MONTHLY",
  intervalN: 1,
  startDate: null,
  endDate: null,
  neverExpires: true,
  nextOccurrenceDate: null,
  nextRunAt: new Date("2026-06-15"),
  status: "ACTIVE",
  amount: 1000,
};

describe("projectOccurrences", () => {
  it("returns empty array for non-ACTIVE profiles", () => {
    for (const status of ["PAUSED", "STOPPED", "EXPIRED"]) {
      const out = projectOccurrences(
        { ...baseProfile, status },
        new Date("2026-06-01"),
        new Date("2026-08-31")
      );
      expect(out).toEqual([]);
    }
  });

  it("projects monthly occurrences within the window", () => {
    const out = projectOccurrences(
      { ...baseProfile, frequency: "MONTHLY", nextRunAt: new Date("2026-06-15") },
      new Date("2026-06-01"),
      new Date("2026-09-30")
    );
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-06-15",
      "2026-07-15",
      "2026-08-15",
      "2026-09-15",
    ]);
  });

  it("projects weekly with intervalN=2 (fortnightly)", () => {
    const out = projectOccurrences(
      {
        ...baseProfile,
        frequency: "WEEKLY",
        intervalN: 2,
        nextRunAt: new Date("2026-06-01"),
      },
      new Date("2026-06-01"),
      new Date("2026-07-15")
    );
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-06-01",
      "2026-06-15",
      "2026-06-29",
      "2026-07-13",
    ]);
  });

  it("projects daily", () => {
    const out = projectOccurrences(
      {
        ...baseProfile,
        frequency: "DAILY",
        intervalN: 3,
        nextRunAt: new Date("2026-06-01"),
      },
      new Date("2026-06-01"),
      new Date("2026-06-10")
    );
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-06-01",
      "2026-06-04",
      "2026-06-07",
      "2026-06-10",
    ]);
  });

  it("projects yearly", () => {
    const out = projectOccurrences(
      {
        ...baseProfile,
        frequency: "YEARLY",
        nextRunAt: new Date("2026-06-15"),
      },
      new Date("2026-01-01"),
      new Date("2029-12-31")
    );
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-06-15",
      "2027-06-15",
      "2028-06-15",
      "2029-06-15",
    ]);
  });

  it("respects endDate when not neverExpires", () => {
    const out = projectOccurrences(
      {
        ...baseProfile,
        frequency: "MONTHLY",
        nextRunAt: new Date("2026-06-15"),
        endDate: new Date("2026-08-31"),
        neverExpires: false,
      },
      new Date("2026-06-01"),
      new Date("2026-12-31")
    );
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-06-15",
      "2026-07-15",
      "2026-08-15",
    ]);
  });

  it("ignores endDate when neverExpires is true", () => {
    const out = projectOccurrences(
      {
        ...baseProfile,
        frequency: "MONTHLY",
        nextRunAt: new Date("2026-06-15"),
        endDate: new Date("2026-07-01"), // would clip in non-neverExpires
        neverExpires: true,
      },
      new Date("2026-06-01"),
      new Date("2026-09-30")
    );
    expect(out.length).toBe(4); // Jun, Jul, Aug, Sep — endDate ignored
  });

  it("prefers nextOccurrenceDate over nextRunAt when both set", () => {
    const out = projectOccurrences(
      {
        ...baseProfile,
        frequency: "MONTHLY",
        nextRunAt: new Date("2026-06-15"),
        nextOccurrenceDate: new Date("2026-07-01"),
      },
      new Date("2026-06-01"),
      new Date("2026-09-30")
    );
    // Should start from July 1, not June 15
    expect(out[0].toISOString().slice(0, 10)).toBe("2026-07-01");
  });

  it("skips occurrences before window start", () => {
    const out = projectOccurrences(
      {
        ...baseProfile,
        frequency: "MONTHLY",
        nextRunAt: new Date("2025-06-15"), // way before window
      },
      new Date("2026-06-01"),
      new Date("2026-08-31")
    );
    expect(out.length).toBe(3); // June, July, August
    expect(out[0].toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("handles unknown frequency by defaulting to monthly", () => {
    const out = projectOccurrences(
      {
        ...baseProfile,
        frequency: "WEIRD_THING",
        nextRunAt: new Date("2026-06-15"),
      },
      new Date("2026-06-01"),
      new Date("2026-09-30")
    );
    expect(out.length).toBe(4); // monthly fallback
  });

  it("handles quarterly alias", () => {
    const out = projectOccurrences(
      {
        ...baseProfile,
        frequency: "quarterly",
        nextRunAt: new Date("2026-06-15"),
      },
      new Date("2026-06-01"),
      new Date("2027-06-30")
    );
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-06-15",
      "2026-09-15",
      "2026-12-15",
      "2027-03-15",
      "2027-06-15",
    ]);
  });

  it("safety cap kicks in at 200 occurrences", () => {
    // Daily with intervalN=1 over a 10-year window — would be ~3650
    // occurrences without the cap.
    const out = projectOccurrences(
      {
        ...baseProfile,
        frequency: "DAILY",
        intervalN: 1,
        nextRunAt: new Date("2026-01-01"),
      },
      new Date("2026-01-01"),
      new Date("2036-01-01")
    );
    expect(out.length).toBeLessThanOrEqual(200);
  });
});
