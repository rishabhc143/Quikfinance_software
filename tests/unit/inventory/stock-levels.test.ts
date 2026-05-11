import { describe, it, expect } from "vitest";
import { computeItemStock } from "@/lib/inventory/stock-levels";

/**
 * Unit tests for the pure stock-status math used by the Stock
 * Levels page.
 */

describe("computeItemStock", () => {
  it("status OK when current is above reorder point (no reservations)", () => {
    expect(
      computeItemStock({
        openingStock: 100,
        totalAdjustment: -20,
        reorderPoint: 30,
      })
    ).toEqual({ currentStock: 80, reserved: 0, available: 80, status: "OK" });
  });

  it("status LOW when current is exactly at reorder point", () => {
    expect(
      computeItemStock({
        openingStock: 50,
        totalAdjustment: -20,
        reorderPoint: 30,
      })
    ).toEqual({ currentStock: 30, reserved: 0, available: 30, status: "LOW" });
  });

  it("status LOW when current is below reorder point but above 0", () => {
    expect(
      computeItemStock({
        openingStock: 100,
        totalAdjustment: -80,
        reorderPoint: 30,
      })
    ).toEqual({ currentStock: 20, reserved: 0, available: 20, status: "LOW" });
  });

  it("status OUT when current is exactly 0", () => {
    expect(
      computeItemStock({
        openingStock: 50,
        totalAdjustment: -50,
        reorderPoint: 10,
      })
    ).toEqual({ currentStock: 0, reserved: 0, available: 0, status: "OUT" });
  });

  it("status OUT when current goes negative (over-decremented)", () => {
    expect(
      computeItemStock({
        openingStock: 10,
        totalAdjustment: -15,
        reorderPoint: 5,
      })
    ).toEqual({ currentStock: -5, reserved: 0, available: -5, status: "OUT" });
  });

  it("status OK when no reorder point is set and current is positive", () => {
    expect(
      computeItemStock({
        openingStock: 5,
        totalAdjustment: 0,
        reorderPoint: null,
      })
    ).toEqual({ currentStock: 5, reserved: 0, available: 5, status: "OK" });
  });

  it("status OUT when no reorder point but current is 0", () => {
    expect(
      computeItemStock({
        openingStock: 0,
        totalAdjustment: 0,
        reorderPoint: null,
      })
    ).toEqual({ currentStock: 0, reserved: 0, available: 0, status: "OUT" });
  });

  it("positive adjustments accumulate (restock)", () => {
    expect(
      computeItemStock({
        openingStock: 10,
        totalAdjustment: 25, // received 25 units back
        reorderPoint: 5,
      })
    ).toEqual({ currentStock: 35, reserved: 0, available: 35, status: "OK" });
  });

  it("handles fractional stock (e.g. weighted items)", () => {
    expect(
      computeItemStock({
        openingStock: 12.5,
        totalAdjustment: -3.75,
        reorderPoint: 10,
      })
    ).toEqual({ currentStock: 8.75, reserved: 0, available: 8.75, status: "LOW" });
  });

  it("net adjustment is zero when invoice decrement is cancelled by credit-note return", () => {
    // Conventional flow: invoice sold 10 units, customer returned 10
    // units via credit note. Net adjustment should be 0, returning the
    // item to its opening-stock level.
    expect(
      computeItemStock({
        openingStock: 100,
        totalAdjustment: -10 /* invoice */ + 10 /* credit note */,
        reorderPoint: 20,
      })
    ).toEqual({ currentStock: 100, reserved: 0, available: 100, status: "OK" });
  });

  it("partial return: invoice -10 + credit note +4 → net -6", () => {
    expect(
      computeItemStock({
        openingStock: 30,
        totalAdjustment: -10 + 4,
        reorderPoint: 20,
      })
    ).toEqual({ currentStock: 24, reserved: 0, available: 24, status: "OK" });
  });

  it("reserved stock reduces available without touching on-hand", () => {
    expect(
      computeItemStock({
        openingStock: 100,
        totalAdjustment: 0,
        reserved: 30,
        reorderPoint: 20,
      })
    ).toEqual({
      currentStock: 100,
      reserved: 30,
      available: 70,
      status: "OK",
    });
  });

  it("status uses available (not currentStock) — full warehouse, all reserved → OUT", () => {
    expect(
      computeItemStock({
        openingStock: 50,
        totalAdjustment: 0,
        reserved: 50,
        reorderPoint: 10,
      })
    ).toEqual({
      currentStock: 50,
      reserved: 50,
      available: 0,
      status: "OUT",
    });
  });

  it("status LOW when available is at or below reorder, even if on-hand is high", () => {
    // Warehouse has 100, but 90 are reserved — only 10 available,
    // reorder point is 20.
    expect(
      computeItemStock({
        openingStock: 100,
        totalAdjustment: 0,
        reserved: 90,
        reorderPoint: 20,
      })
    ).toEqual({
      currentStock: 100,
      reserved: 90,
      available: 10,
      status: "LOW",
    });
  });
});
