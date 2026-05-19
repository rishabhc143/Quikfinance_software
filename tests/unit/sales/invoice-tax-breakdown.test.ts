import { describe, it, expect } from "vitest";
import {
  groupByTaxRate,
  subtotal,
  grandTotal,
} from "@/lib/sales/invoice-tax-breakdown";

describe("groupByTaxRate", () => {
  it("returns empty array when no lines have tax", () => {
    expect(
      groupByTaxRate([
        { amount: 1000, taxRate: 0 },
        { amount: 500, taxRate: 0 },
      ])
    ).toEqual([]);
  });

  it("aggregates a single tax rate matching reference PDF", () => {
    // 2,10,000 at IGST 18% = 37,800
    expect(
      groupByTaxRate([{ amount: 210000, taxRate: 18, taxKind: "IGST" }])
    ).toEqual([{ label: "IGST18 (18%)", amount: 37800 }]);
  });

  it("groups multiple lines with the same rate into one bucket", () => {
    const result = groupByTaxRate([
      { amount: 100000, taxRate: 18, taxKind: "IGST" },
      { amount: 50000, taxRate: 18, taxKind: "IGST" },
    ]);
    expect(result).toEqual([{ label: "IGST18 (18%)", amount: 27000 }]);
  });

  it("splits lines with different rates into separate buckets", () => {
    const result = groupByTaxRate([
      { amount: 100000, taxRate: 18, taxKind: "IGST" },
      { amount: 50000, taxRate: 12, taxKind: "IGST" },
    ]);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ label: "IGST18 (18%)", amount: 18000 });
    expect(result).toContainEqual({ label: "IGST12 (12%)", amount: 6000 });
  });

  it("defaults taxKind to IGST when unspecified", () => {
    const result = groupByTaxRate([{ amount: 1000, taxRate: 18 }]);
    expect(result[0].label).toMatch(/^IGST/);
  });

  it("rounds tax amounts to 2 decimal places", () => {
    const result = groupByTaxRate([
      { amount: 100.555, taxRate: 18, taxKind: "IGST" },
    ]);
    // 100.555 * 18 / 100 = 18.0999... → rounded to 18.10
    expect(result[0].amount).toBeCloseTo(18.1, 2);
  });

  it("skips lines with zero or negative tax rate", () => {
    expect(
      groupByTaxRate([
        { amount: 1000, taxRate: 0 },
        { amount: 1000, taxRate: -5 },
      ])
    ).toEqual([]);
  });
});

describe("subtotal", () => {
  it("sums pre-tax line amounts", () => {
    expect(
      subtotal([
        { amount: 100, taxRate: 18 },
        { amount: 250, taxRate: 12 },
      ])
    ).toBe(350);
  });
  it("returns 0 for empty input", () => {
    expect(subtotal([])).toBe(0);
  });
});

describe("grandTotal", () => {
  it("returns subtotal + total tax (matches reference PDF)", () => {
    // Reference: 2,10,000 subtotal + 37,800 IGST = 2,47,800
    expect(
      grandTotal([{ amount: 210000, taxRate: 18, taxKind: "IGST" }])
    ).toBe(247800);
  });
});
