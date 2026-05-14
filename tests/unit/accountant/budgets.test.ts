import { describe, it, expect } from "vitest";
import {
  monthlyBucketsForYear,
  distributeAnnualEvenly,
  isCreditNaturalAccount,
  computeVariance,
  BUDGETABLE_ACCOUNT_TYPES,
} from "@/lib/accounting/budgets";

/**
 * ACCT-D — Tests for the pure helpers powering Budgets + Budget
 * vs Actuals. The detail page's Prisma groupBy is integration-
 * tested via Playwright; this file pins:
 *   - 12-bucket slicing (calendar + Indian-FY + boundary)
 *   - the rounding-remainder invariant on distribute
 *   - the credit/debit sign rule per CoA type
 *   - variance math (incl. pct-undefined on budget=0)
 */

// ─────────────── monthlyBucketsForYear ───────────────

describe("monthlyBucketsForYear", () => {
  it("returns 12 buckets for a calendar-year (fiscalYearStart=1)", () => {
    const buckets = monthlyBucketsForYear(2026, 1);
    expect(buckets).toHaveLength(12);
    // First bucket = Jan 2026.
    expect(buckets[0].start.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(buckets[0].end.toISOString().slice(0, 10)).toBe("2026-01-31");
    // Last bucket = Dec 2026.
    expect(buckets[11].start.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(buckets[11].end.toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("wraps across the calendar year for the Indian FY (fiscalYearStart=4)", () => {
    const buckets = monthlyBucketsForYear(2026, 4);
    expect(buckets[0].start.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(buckets[0].end.toISOString().slice(0, 10)).toBe("2026-04-30");
    expect(buckets[11].start.toISOString().slice(0, 10)).toBe("2027-03-01");
    expect(buckets[11].end.toISOString().slice(0, 10)).toBe("2027-03-31");
  });

  it("handles February boundaries (leap + non-leap)", () => {
    // FY24-25 starting in April 2024 → Feb bucket falls in 2025 (non-leap).
    const fy24 = monthlyBucketsForYear(2024, 4);
    expect(fy24[10].end.toISOString().slice(0, 10)).toBe("2025-02-28");
    // FY27-28 starting in April 2027 → Feb bucket falls in 2028 (leap).
    const fy27 = monthlyBucketsForYear(2027, 4);
    expect(fy27[10].end.toISOString().slice(0, 10)).toBe("2028-02-29");
  });

  it("rejects an out-of-range start month", () => {
    expect(() => monthlyBucketsForYear(2026, 0)).toThrow();
    expect(() => monthlyBucketsForYear(2026, 13)).toThrow();
    expect(() => monthlyBucketsForYear(2026, 1.5)).toThrow();
  });
});

// ─────────────── distributeAnnualEvenly ───────────────

describe("distributeAnnualEvenly", () => {
  it("splits a clean number into 12 equal parts (no remainder)", () => {
    const monthly = distributeAnnualEvenly(120_000);
    expect(monthly).toHaveLength(12);
    expect(monthly.every((m) => m === 10_000)).toBe(true);
    // Σ = annual.
    expect(monthly.reduce((s, m) => s + m, 0)).toBe(120_000);
  });

  it("puts the rounding remainder on the LAST bucket so Σ === annual", () => {
    const monthly = distributeAnnualEvenly(100_000);
    // 100_000 / 12 in 4-decimal precision = 8_333.3333… per cell;
    // last cell absorbs the remainder.
    const sum = monthly.reduce((s, m) => s + m, 0);
    expect(Math.abs(sum - 100_000)).toBeLessThan(0.0001);
    // First 11 cells are equal; the 12th picks up the rest.
    for (let i = 0; i < 11; i++) {
      expect(monthly[i]).toBe(monthly[0]);
    }
    expect(monthly[11]).not.toBe(monthly[0]);
  });

  it("handles zero", () => {
    expect(distributeAnnualEvenly(0)).toEqual(new Array(12).fill(0));
  });

  it("rejects NaN / Infinity", () => {
    expect(() => distributeAnnualEvenly(NaN)).toThrow();
    expect(() => distributeAnnualEvenly(Infinity)).toThrow();
  });
});

// ─────────────── isCreditNaturalAccount ───────────────

describe("isCreditNaturalAccount", () => {
  it("returns true for income-side accounts", () => {
    expect(isCreditNaturalAccount("INCOME")).toBe(true);
    expect(isCreditNaturalAccount("OTHER_INCOME")).toBe(true);
  });

  it("returns false for expense / COGS / balance-sheet", () => {
    expect(isCreditNaturalAccount("EXPENSE")).toBe(false);
    expect(isCreditNaturalAccount("OTHER_EXPENSE")).toBe(false);
    expect(isCreditNaturalAccount("COST_OF_GOODS_SOLD")).toBe(false);
    expect(isCreditNaturalAccount("ASSET")).toBe(false);
    expect(isCreditNaturalAccount("LIABILITY")).toBe(false);
    expect(isCreditNaturalAccount("EQUITY")).toBe(false);
  });
});

// ─────────────── computeVariance ───────────────

describe("computeVariance", () => {
  it("returns actual − budget + percentage", () => {
    expect(computeVariance(100, 120)).toEqual({ variance: 20, pct: 20 });
    expect(computeVariance(100, 80)).toEqual({ variance: -20, pct: -20 });
    expect(computeVariance(100, 100)).toEqual({ variance: 0, pct: 0 });
  });

  it("returns pct = null when the budget is zero (ratio undefined)", () => {
    expect(computeVariance(0, 500)).toEqual({ variance: 500, pct: null });
    expect(computeVariance(0, 0)).toEqual({ variance: 0, pct: null });
  });
});

// ─────────────── BUDGETABLE_ACCOUNT_TYPES ───────────────

describe("BUDGETABLE_ACCOUNT_TYPES", () => {
  it("pins the v1 P&L-only restriction", () => {
    // The form + the action validator agree on this list. A change
    // here is a deliberate widening that should require a test
    // update.
    expect([...BUDGETABLE_ACCOUNT_TYPES]).toEqual([
      "INCOME",
      "OTHER_INCOME",
      "EXPENSE",
      "OTHER_EXPENSE",
      "COST_OF_GOODS_SOLD",
    ]);
  });

  it("does NOT include balance-sheet types (asset/liability/equity)", () => {
    expect(BUDGETABLE_ACCOUNT_TYPES).not.toContain("ASSET");
    expect(BUDGETABLE_ACCOUNT_TYPES).not.toContain("LIABILITY");
    expect(BUDGETABLE_ACCOUNT_TYPES).not.toContain("EQUITY");
  });
});
