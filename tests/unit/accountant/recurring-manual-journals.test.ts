import { describe, it, expect } from "vitest";
import { parseTemplate } from "@/lib/accounting/recurring-manual-journals";
import { computeNextOccurrence } from "@/lib/purchases/recurring";

/**
 * ACCT-A.4.c — Tests for the pure helpers powering the Recurring
 * Manual Journals cron. The DB-touching helpers
 * (`generateManualJournalFromProfile`, `advanceRecurringManualJournalCursor`)
 * are integration-tested via Playwright; this file pins:
 *   1. The shape coercion in `parseTemplate` — bad inputs return
 *      null so the cron can skip with a clear reason instead of
 *      crashing.
 *   2. `computeNextOccurrence` reuse — the same advance logic
 *      RecurringBill uses, so cadence semantics stay aligned.
 */

describe("parseTemplate — happy path", () => {
  it("returns the parsed shape when every field is present", () => {
    const t = parseTemplate({
      referenceNumber: "REF-1",
      reportingMethod: "ACCRUAL_ONLY",
      currency: "INR",
      notes: "Monthly accrual",
      lines: [
        {
          accountId: "acc-1",
          contactId: "contact-1",
          projectId: "project-1",
          debit: 100,
          credit: 0,
          description: "DR cash",
        },
        {
          accountId: "acc-2",
          contactId: null,
          projectId: null,
          debit: 0,
          credit: 100,
          description: "CR rent",
        },
      ],
    });
    expect(t).not.toBeNull();
    expect(t?.referenceNumber).toBe("REF-1");
    expect(t?.reportingMethod).toBe("ACCRUAL_ONLY");
    expect(t?.lines).toHaveLength(2);
    expect(t?.lines[0].contactId).toBe("contact-1");
    expect(t?.lines[1].contactId).toBeNull();
  });

  it("coerces missing optional fields to null + defaults reportingMethod", () => {
    const t = parseTemplate({
      lines: [
        { accountId: "acc-1", debit: 100, credit: 0 },
        { accountId: "acc-2", debit: 0, credit: 100 },
      ],
    });
    expect(t?.referenceNumber).toBeNull();
    expect(t?.currency).toBeNull();
    expect(t?.notes).toBeNull();
    expect(t?.reportingMethod).toBe("ACCRUAL_AND_CASH");
    // String → number coercion happens in parseTemplate via Number().
    expect(t?.lines[0].debit).toBe(100);
    // ACCT-A.3.b.2 — tagIds defaults to [] when absent.
    expect(t?.lines[0].tagIds).toEqual([]);
  });

  it("preserves per-line tagIds (ACCT-A.3.b.2)", () => {
    const t = parseTemplate({
      lines: [
        {
          accountId: "acc-1",
          tagIds: ["tag-sales", "tag-q1"],
          debit: 100,
          credit: 0,
        },
        { accountId: "acc-2", tagIds: [], debit: 0, credit: 100 },
      ],
    });
    expect(t?.lines[0].tagIds).toEqual(["tag-sales", "tag-q1"]);
    expect(t?.lines[1].tagIds).toEqual([]);
  });

  it("filters non-string entries out of tagIds (pre-A.3.b.2 forward-compat)", () => {
    const t = parseTemplate({
      lines: [
        {
          accountId: "acc-1",
          tagIds: ["tag-1", null, 42, "", "tag-2"],
          debit: 100,
          credit: 0,
        },
        { accountId: "acc-2", debit: 0, credit: 100 },
      ],
    });
    // Pre-A.3.b.2 profiles may not have tagIds at all; both
    // "missing" and "garbage-mixed-in" land safely as a clean array.
    expect(t?.lines[0].tagIds).toEqual(["tag-1", "tag-2"]);
    expect(t?.lines[1].tagIds).toEqual([]);
  });

  it("coerces string numbers to numbers (JSON round-trip safe)", () => {
    const t = parseTemplate({
      lines: [
        { accountId: "acc-1", debit: "250.50", credit: "0" },
        { accountId: "acc-2", debit: "0", credit: "250.50" },
      ],
    });
    expect(t?.lines[0].debit).toBe(250.5);
    expect(t?.lines[1].credit).toBe(250.5);
  });
});

describe("parseTemplate — defensive nulls", () => {
  it("returns null for non-object inputs", () => {
    expect(parseTemplate(null)).toBeNull();
    expect(parseTemplate(undefined)).toBeNull();
    expect(parseTemplate("string")).toBeNull();
    expect(parseTemplate(42)).toBeNull();
    expect(parseTemplate([])).toBeNull();
  });

  it("returns null when lines is missing or not an array", () => {
    expect(parseTemplate({})).toBeNull();
    expect(parseTemplate({ lines: null })).toBeNull();
    expect(parseTemplate({ lines: "two of them" })).toBeNull();
  });

  it("returns null when there are fewer than 2 lines (would never publish anyway)", () => {
    expect(parseTemplate({ lines: [] })).toBeNull();
    expect(
      parseTemplate({
        lines: [{ accountId: "a1", debit: 100, credit: 0 }],
      })
    ).toBeNull();
  });

  it("returns null when a line is missing accountId", () => {
    expect(
      parseTemplate({
        lines: [
          { accountId: "acc-1", debit: 100, credit: 0 },
          { debit: 0, credit: 100 }, // no accountId
        ],
      })
    ).toBeNull();
  });

  it("falls back to ACCRUAL_AND_CASH for unknown reportingMethod (forward compat)", () => {
    const t = parseTemplate({
      reportingMethod: "MARK_TO_MARKET",
      lines: [
        { accountId: "acc-1", debit: 100, credit: 0 },
        { accountId: "acc-2", debit: 0, credit: 100 },
      ],
    });
    expect(t?.reportingMethod).toBe("ACCRUAL_AND_CASH");
  });
});

describe("computeNextOccurrence reuse", () => {
  // Pin the cadence semantics RecurringBill already ships, so a
  // monthly profile here matches a monthly profile there.
  it("monthly + intervalN=1 advances by one calendar month", () => {
    const next = computeNextOccurrence(
      new Date("2026-05-13T00:00:00.000Z"),
      "monthly",
      1
    );
    expect(next.toISOString().slice(0, 10)).toBe("2026-06-13");
  });

  it("weekly + intervalN=2 advances by 14 days", () => {
    const next = computeNextOccurrence(
      new Date("2026-05-13T00:00:00.000Z"),
      "weekly",
      2
    );
    expect(next.toISOString().slice(0, 10)).toBe("2026-05-27");
  });

  it("quarterly + intervalN=1 advances by 3 months", () => {
    const next = computeNextOccurrence(
      new Date("2026-01-15T00:00:00.000Z"),
      "quarterly",
      1
    );
    expect(next.toISOString().slice(0, 10)).toBe("2026-04-15");
  });

  it("yearly + intervalN=1 advances by 12 months", () => {
    const next = computeNextOccurrence(
      new Date("2026-05-13T00:00:00.000Z"),
      "yearly",
      1
    );
    expect(next.toISOString().slice(0, 10)).toBe("2027-05-13");
  });
});
