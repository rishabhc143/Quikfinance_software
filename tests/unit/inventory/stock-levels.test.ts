import { describe, it, expect } from "vitest";
import { computeItemStock } from "@/lib/inventory/stock-levels";

/**
 * Unit tests for the pure stock-status math used by the Stock
 * Levels page.
 */

describe("computeItemStock", () => {
  it("status OK when current is above reorder point", () => {
    expect(
      computeItemStock({
        openingStock: 100,
        totalAdjustment: -20,
        reorderPoint: 30,
      })
    ).toEqual({ currentStock: 80, status: "OK" });
  });

  it("status LOW when current is exactly at reorder point", () => {
    expect(
      computeItemStock({
        openingStock: 50,
        totalAdjustment: -20,
        reorderPoint: 30,
      })
    ).toEqual({ currentStock: 30, status: "LOW" });
  });

  it("status LOW when current is below reorder point but above 0", () => {
    expect(
      computeItemStock({
        openingStock: 100,
        totalAdjustment: -80,
        reorderPoint: 30,
      })
    ).toEqual({ currentStock: 20, status: "LOW" });
  });

  it("status OUT when current is exactly 0", () => {
    expect(
      computeItemStock({
        openingStock: 50,
        totalAdjustment: -50,
        reorderPoint: 10,
      })
    ).toEqual({ currentStock: 0, status: "OUT" });
  });

  it("status OUT when current goes negative (over-decremented)", () => {
    expect(
      computeItemStock({
        openingStock: 10,
        totalAdjustment: -15,
        reorderPoint: 5,
      })
    ).toEqual({ currentStock: -5, status: "OUT" });
  });

  it("status OK when no reorder point is set and current is positive", () => {
    expect(
      computeItemStock({
        openingStock: 5,
        totalAdjustment: 0,
        reorderPoint: null,
      })
    ).toEqual({ currentStock: 5, status: "OK" });
  });

  it("status OUT when no reorder point but current is 0", () => {
    expect(
      computeItemStock({
        openingStock: 0,
        totalAdjustment: 0,
        reorderPoint: null,
      })
    ).toEqual({ currentStock: 0, status: "OUT" });
  });

  it("positive adjustments accumulate (restock)", () => {
    expect(
      computeItemStock({
        openingStock: 10,
        totalAdjustment: 25, // received 25 units back
        reorderPoint: 5,
      })
    ).toEqual({ currentStock: 35, status: "OK" });
  });

  it("handles fractional stock (e.g. weighted items)", () => {
    expect(
      computeItemStock({
        openingStock: 12.5,
        totalAdjustment: -3.75,
        reorderPoint: 10,
      })
    ).toEqual({ currentStock: 8.75, status: "LOW" });
  });
});
