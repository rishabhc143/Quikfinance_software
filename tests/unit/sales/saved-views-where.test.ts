import { describe, it, expect } from "vitest";
import { whereForFilter, type FilterJson } from "@/lib/sales/saved-views";

/**
 * Unit tests for the SavedView filter → Prisma where translator.
 *
 * v2 adds dateRange, amountRange, customer multi-select, and an
 * `and` combinator. Each case asserts the expected Prisma
 * fragment so a regression doesn't silently broaden a saved view's
 * results.
 */

describe("whereForFilter — all & legacy kinds", () => {
  it('"all" returns an empty object (callers spread it)', () => {
    expect(whereForFilter({ kind: "all" })).toEqual({});
  });

  it("single status value", () => {
    expect(whereForFilter({ kind: "status", value: "DRAFT" })).toEqual({
      status: "DRAFT",
    });
  });

  it("multi-value status", () => {
    expect(
      whereForFilter({ kind: "status", value: ["DRAFT", "SENT"] })
    ).toEqual({ status: { in: ["DRAFT", "SENT"] } });
  });

  it("boolean field", () => {
    expect(
      whereForFilter({
        kind: "boolean",
        field: "isInactive",
        value: false,
      })
    ).toEqual({ isInactive: false });
  });
});

describe("whereForFilter — dateRange", () => {
  it("from + to produces a Prisma gte/lte fragment", () => {
    const w = whereForFilter({
      kind: "dateRange",
      field: "issueDate",
      from: "2026-04-01",
      to: "2026-04-30",
    });
    expect(w).toHaveProperty("issueDate");
    const range = (w as Record<string, Record<string, Date>>).issueDate;
    expect(range.gte).toBeInstanceOf(Date);
    expect(range.lte).toBeInstanceOf(Date);
    // YYYY-MM-DD `to` should be coerced to end-of-day (so the 30th is included)
    expect(range.lte.getUTCHours()).toBe(23);
    expect(range.lte.getUTCMinutes()).toBe(59);
  });

  it("only `from` is supported (open-ended right side)", () => {
    const w = whereForFilter({
      kind: "dateRange",
      field: "issueDate",
      from: "2026-04-01",
    });
    const range = (w as Record<string, Record<string, Date>>).issueDate;
    expect(range.gte).toBeInstanceOf(Date);
    expect(range.lte).toBeUndefined();
  });

  it("only `to` is supported (open-ended left side)", () => {
    const w = whereForFilter({
      kind: "dateRange",
      field: "issueDate",
      to: "2026-04-30",
    });
    const range = (w as Record<string, Record<string, Date>>).issueDate;
    expect(range.gte).toBeUndefined();
    expect(range.lte).toBeInstanceOf(Date);
  });

  it("returns {} when neither from nor to is set", () => {
    expect(
      whereForFilter({ kind: "dateRange", field: "issueDate" })
    ).toEqual({});
  });
});

describe("whereForFilter — amountRange", () => {
  it("min + max produces gte/lte", () => {
    expect(
      whereForFilter({
        kind: "amountRange",
        field: "total",
        min: 100,
        max: 1000,
      })
    ).toEqual({ total: { gte: 100, lte: 1000 } });
  });

  it("only `min`", () => {
    expect(
      whereForFilter({ kind: "amountRange", field: "total", min: 500 })
    ).toEqual({ total: { gte: 500 } });
  });

  it("only `max`", () => {
    expect(
      whereForFilter({ kind: "amountRange", field: "total", max: 5000 })
    ).toEqual({ total: { lte: 5000 } });
  });

  it("returns {} when neither min nor max is set", () => {
    expect(whereForFilter({ kind: "amountRange", field: "total" })).toEqual(
      {}
    );
  });

  it("allows zero values (not coerced to empty)", () => {
    expect(
      whereForFilter({ kind: "amountRange", field: "total", min: 0, max: 0 })
    ).toEqual({ total: { gte: 0, lte: 0 } });
  });
});

describe("whereForFilter — customer", () => {
  it("single customer id", () => {
    expect(whereForFilter({ kind: "customer", ids: ["c1"] })).toEqual({
      contactId: { in: ["c1"] },
    });
  });

  it("multiple customer ids", () => {
    expect(
      whereForFilter({ kind: "customer", ids: ["c1", "c2", "c3"] })
    ).toEqual({ contactId: { in: ["c1", "c2", "c3"] } });
  });

  it("returns {} when ids array is empty", () => {
    expect(whereForFilter({ kind: "customer", ids: [] })).toEqual({});
  });
});

describe("whereForFilter — and combinator", () => {
  it("combines status + dateRange under Prisma AND", () => {
    const w = whereForFilter({
      kind: "and",
      filters: [
        { kind: "status", value: "SENT" },
        {
          kind: "dateRange",
          field: "issueDate",
          from: "2026-04-01",
          to: "2026-04-30",
        },
      ],
    }) as { AND: Array<Record<string, unknown>> };
    expect(Array.isArray(w.AND)).toBe(true);
    expect(w.AND).toHaveLength(2);
    expect(w.AND[0]).toEqual({ status: "SENT" });
    expect(w.AND[1]).toHaveProperty("issueDate");
  });

  it("unwraps to the single fragment when only one part is non-empty", () => {
    // "all" contributes nothing — should fall through to just status
    expect(
      whereForFilter({
        kind: "and",
        filters: [{ kind: "all" }, { kind: "status", value: "DRAFT" }],
      })
    ).toEqual({ status: "DRAFT" });
  });

  it("returns {} when all sub-filters are empty", () => {
    expect(
      whereForFilter({
        kind: "and",
        filters: [{ kind: "all" }, { kind: "customer", ids: [] }],
      })
    ).toEqual({});
  });

  it("composes status + amountRange + customer into a 3-part AND", () => {
    const w = whereForFilter({
      kind: "and",
      filters: [
        { kind: "status", value: ["SENT", "PARTIALLY_PAID"] },
        { kind: "amountRange", field: "total", min: 1000 },
        { kind: "customer", ids: ["c1", "c2"] },
      ],
    }) as { AND: Array<Record<string, unknown>> };
    expect(w.AND).toHaveLength(3);
    expect(w.AND).toContainEqual({ status: { in: ["SENT", "PARTIALLY_PAID"] } });
    expect(w.AND).toContainEqual({ total: { gte: 1000 } });
    expect(w.AND).toContainEqual({ contactId: { in: ["c1", "c2"] } });
  });
});

describe("whereForFilter — unknown kinds are no-ops", () => {
  it("returns {} for an unrecognized kind (defensive)", () => {
    const bogus = { kind: "xyzzy" } as unknown as FilterJson;
    expect(whereForFilter(bogus)).toEqual({});
  });
});
