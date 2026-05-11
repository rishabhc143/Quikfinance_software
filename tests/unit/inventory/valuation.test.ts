import { describe, it, expect } from "vitest";
import { summarizeValuation } from "@/lib/inventory/valuation";
import type { ItemStockRow } from "@/lib/inventory/stock-levels";

/**
 * Pure tests for the valuation summary.
 *
 * The Prisma-backed entry point `computeStockValuation` is exercised
 * by the page itself; here we test the math: per-item value, totals,
 * counts of items below reorder / out of stock / missing cost.
 */

function row(
  over: Partial<ItemStockRow & { costPrice: number | null }> = {}
): ItemStockRow & { costPrice: number | null } {
  return {
    id: "i1",
    name: "Widget",
    sku: null,
    unit: null,
    openingStock: 100,
    totalAdjustment: -20,
    currentStock: 80,
    reserved: 0,
    available: 80,
    reorderPoint: null,
    status: "OK",
    costPrice: 10,
    ...over,
  };
}

describe("summarizeValuation", () => {
  it("values a single item at qty × cost", () => {
    const s = summarizeValuation([row({ currentStock: 80, costPrice: 10 })]);
    expect(s.totalValue).toBe(800);
    expect(s.totalItems).toBe(1);
    expect(s.totalUnits).toBe(80);
  });

  it("sums values across multiple items", () => {
    const s = summarizeValuation([
      row({ id: "a", currentStock: 10, costPrice: 100 }),
      row({ id: "b", currentStock: 5, costPrice: 200 }),
    ]);
    // 10*100 + 5*200 = 2000
    expect(s.totalValue).toBe(2000);
    expect(s.totalUnits).toBe(15);
  });

  it("flags items with no cost price and contributes 0 from them", () => {
    const s = summarizeValuation([
      row({ id: "a", currentStock: 10, costPrice: 100 }),
      row({ id: "b", currentStock: 50, costPrice: null }),
    ]);
    expect(s.totalValue).toBe(1000); // only the first item counts
    expect(s.itemsMissingCost).toBe(1);
    expect(s.rows[1].missingCost).toBe(true);
    expect(s.rows[1].value).toBe(0);
  });

  it("treats costPrice=0 as missing (data hygiene)", () => {
    const s = summarizeValuation([
      row({ id: "a", currentStock: 10, costPrice: 0 }),
    ]);
    expect(s.itemsMissingCost).toBe(1);
    expect(s.rows[0].missingCost).toBe(true);
  });

  it("counts items below reorder and out of stock separately", () => {
    const s = summarizeValuation([
      row({ id: "a", status: "OK" }),
      row({ id: "b", status: "LOW" }),
      row({ id: "c", status: "LOW" }),
      row({ id: "d", status: "OUT" }),
    ]);
    expect(s.itemsBelowReorder).toBe(2);
    expect(s.itemsOutOfStock).toBe(1);
  });

  it("excludes negative or zero stock from totalUnits", () => {
    // Over-decremented stock shouldn't pretend to have units on hand
    const s = summarizeValuation([
      row({ id: "a", currentStock: 5, costPrice: 10 }),
      row({ id: "b", currentStock: -3, costPrice: 10 }), // bad state
      row({ id: "c", currentStock: 0, costPrice: 10 }),
    ]);
    expect(s.totalUnits).toBe(5);
    // Value still computed for transparency (and to surface the bug)
    expect(s.totalValue).toBe(5 * 10 + -3 * 10 + 0 * 10);
  });

  it("handles fractional quantities and prices", () => {
    const s = summarizeValuation([
      row({ currentStock: 2.5, costPrice: 99.99 }),
    ]);
    // 2.5 × 99.99 = 249.975
    expect(s.totalValue).toBeCloseTo(249.975, 4);
  });

  it("empty input → zero everything", () => {
    const s = summarizeValuation([]);
    expect(s.totalValue).toBe(0);
    expect(s.totalUnits).toBe(0);
    expect(s.totalItems).toBe(0);
    expect(s.itemsMissingCost).toBe(0);
    expect(s.itemsBelowReorder).toBe(0);
    expect(s.itemsOutOfStock).toBe(0);
    expect(s.rows).toEqual([]);
  });
});
