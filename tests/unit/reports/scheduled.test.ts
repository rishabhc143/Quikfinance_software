import { describe, it, expect } from "vitest";
import {
  advanceNextSendAt,
  computeInitialNextSendAt,
  parseRecipients,
  recipientsFromDb,
  recipientsToDb,
  isScheduleFrequency,
  isScheduleFormat,
} from "@/lib/reports/scheduled";

/**
 * REPORTS — Scheduled report pure-helper tests.
 *
 * The cron worker advances rows by the schedule's frequency and
 * skips forward to "after now" at create time. Both paths must
 * be deterministic and never go backwards or sit at the start
 * date forever — testing pins those invariants.
 */

describe("advanceNextSendAt", () => {
  it("DAILY adds 1 day", () => {
    const base = new Date("2026-05-15T09:00:00.000Z");
    expect(advanceNextSendAt(base, "DAILY").toISOString()).toBe(
      "2026-05-16T09:00:00.000Z"
    );
  });

  it("WEEKLY adds 7 days", () => {
    const base = new Date("2026-05-15T09:00:00.000Z");
    expect(advanceNextSendAt(base, "WEEKLY").toISOString()).toBe(
      "2026-05-22T09:00:00.000Z"
    );
  });

  it("MONTHLY adds 1 month", () => {
    const base = new Date("2026-05-15T09:00:00.000Z");
    expect(advanceNextSendAt(base, "MONTHLY").toISOString()).toBe(
      "2026-06-15T09:00:00.000Z"
    );
  });

  it("MONTHLY across year boundary", () => {
    const base = new Date("2026-12-15T09:00:00.000Z");
    expect(advanceNextSendAt(base, "MONTHLY").toISOString()).toBe(
      "2027-01-15T09:00:00.000Z"
    );
  });
});

describe("computeInitialNextSendAt", () => {
  it("returns the start date when it's already in the future", () => {
    const start = new Date("2026-05-20T09:00:00.000Z");
    const now = new Date("2026-05-15T00:00:00.000Z");
    expect(computeInitialNextSendAt(start, "WEEKLY", now).toISOString()).toBe(
      start.toISOString()
    );
  });

  it("skips forward week-by-week past the past start date", () => {
    // Start was 3 weeks ago. Advance 4 times to land in future.
    const start = new Date("2026-04-24T09:00:00.000Z");
    const now = new Date("2026-05-15T10:00:00.000Z");
    const next = computeInitialNextSendAt(start, "WEEKLY", now);
    // 2026-04-24, 05-01, 05-08, 05-15. 05-15T09:00 < 05-15T10:00,
    // so advance once more to 05-22.
    expect(next.toISOString()).toBe("2026-05-22T09:00:00.000Z");
  });

  it("doesn't infinite-loop on a Jan 1900 start", () => {
    const start = new Date("1900-01-01T00:00:00.000Z");
    const now = new Date("2026-05-15T00:00:00.000Z");
    const next = computeInitialNextSendAt(start, "MONTHLY", now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("parseRecipients", () => {
  it("splits on commas, semicolons, and newlines", () => {
    const r = parseRecipients("a@x.com, b@x.com; c@x.com\nd@x.com");
    expect(r.valid).toEqual(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
    expect(r.invalid).toEqual([]);
  });

  it("rejects malformed emails", () => {
    const r = parseRecipients("good@x.com, not-an-email, another@");
    expect(r.valid).toEqual(["good@x.com"]);
    expect(r.invalid).toEqual(["not-an-email", "another@"]);
  });

  it("dedupes case-insensitively", () => {
    const r = parseRecipients("Foo@x.com, foo@X.com, bar@x.com");
    // Preserves the first occurrence's casing.
    expect(r.valid).toEqual(["Foo@x.com", "bar@x.com"]);
  });

  it("trims whitespace", () => {
    const r = parseRecipients("  alice@x.com  ,  bob@x.com  ");
    expect(r.valid).toEqual(["alice@x.com", "bob@x.com"]);
  });

  it("handles empty input", () => {
    expect(parseRecipients("")).toEqual({ valid: [], invalid: [] });
    expect(parseRecipients("   \n   ")).toEqual({ valid: [], invalid: [] });
  });
});

describe("recipientsToDb / recipientsFromDb roundtrip", () => {
  it("roundtrips", () => {
    const list = ["a@x.com", "b@x.com", "c@x.com"];
    expect(recipientsFromDb(recipientsToDb(list))).toEqual(list);
  });

  it("recipientsFromDb is resilient to extra whitespace", () => {
    expect(recipientsFromDb("a@x.com,  b@x.com ,c@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
    ]);
  });
});

describe("type guards", () => {
  it("isScheduleFrequency", () => {
    expect(isScheduleFrequency("DAILY")).toBe(true);
    expect(isScheduleFrequency("WEEKLY")).toBe(true);
    expect(isScheduleFrequency("MONTHLY")).toBe(true);
    expect(isScheduleFrequency("HOURLY")).toBe(false);
    expect(isScheduleFrequency("")).toBe(false);
  });

  it("isScheduleFormat", () => {
    expect(isScheduleFormat("PDF")).toBe(true);
    expect(isScheduleFormat("XLSX")).toBe(true);
    expect(isScheduleFormat("CSV")).toBe(true);
    expect(isScheduleFormat("DOCX")).toBe(false);
  });
});
