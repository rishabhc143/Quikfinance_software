import { describe, it, expect } from "vitest";
import {
  computeSummary,
  type ReconciliationLine,
} from "@/lib/banking/reconciliation-summary";

/**
 * Tests for BNK-F reconciliation summary math.
 *
 * The helper takes the opening balance, the period's transactions
 * (each tagged cleared/not), and the target closing balance — then
 * returns the running cleared totals and the Difference. The
 * Finalise action refuses unless balanced=true.
 */

const LINE = (
  id: string,
  amount: number,
  type: "CREDIT" | "DEBIT",
  cleared = false
): ReconciliationLine => ({ id, amount, type, cleared });

describe("computeSummary — empty / no-clearings", () => {
  it("returns zero clearings when nothing is ticked", () => {
    const s = computeSummary({
      openingBalance: 10000,
      closingBalance: 12500,
      lines: [LINE("a", 1000, "CREDIT"), LINE("b", 500, "DEBIT")],
    });
    expect(s.clearedIn).toBe(0);
    expect(s.clearedOut).toBe(0);
    expect(s.netCleared).toBe(10000);
    // difference = netCleared - closing = 10000 - 12500 = -2500
    expect(s.difference).toBe(-2500);
    expect(s.balanced).toBe(false);
    expect(s.clearedCount).toBe(0);
    expect(s.unclearedCount).toBe(2);
  });

  it("returns 0 difference when opening already equals closing", () => {
    const s = computeSummary({
      openingBalance: 10000,
      closingBalance: 10000,
      lines: [],
    });
    expect(s.difference).toBe(0);
    expect(s.balanced).toBe(true);
  });
});

describe("computeSummary — running totals", () => {
  it("sums cleared CREDIT into clearedIn", () => {
    const s = computeSummary({
      openingBalance: 0,
      closingBalance: 0,
      lines: [LINE("a", 100, "CREDIT", true), LINE("b", 200, "CREDIT", true)],
    });
    expect(s.clearedIn).toBe(300);
    expect(s.clearedOut).toBe(0);
    expect(s.netCleared).toBe(300);
  });

  it("sums cleared DEBIT into clearedOut", () => {
    const s = computeSummary({
      openingBalance: 1000,
      closingBalance: 0,
      lines: [LINE("a", 400, "DEBIT", true), LINE("b", 600, "DEBIT", true)],
    });
    expect(s.clearedIn).toBe(0);
    expect(s.clearedOut).toBe(1000);
    expect(s.netCleared).toBe(0);
    expect(s.difference).toBe(0);
    expect(s.balanced).toBe(true);
  });

  it("skips unticked rows entirely", () => {
    const s = computeSummary({
      openingBalance: 0,
      closingBalance: 100,
      lines: [
        LINE("a", 100, "CREDIT", true),
        LINE("b", 5000, "CREDIT", false), // ignored
        LINE("c", 999, "DEBIT", false), //  ignored
      ],
    });
    expect(s.clearedIn).toBe(100);
    expect(s.clearedOut).toBe(0);
    expect(s.netCleared).toBe(100);
    expect(s.difference).toBe(0);
    expect(s.balanced).toBe(true);
  });

  it("normalises signed amounts to abs() so the input convention doesn't matter", () => {
    // Caller can pass amounts either as positive (sign in `type`) or
    // negative (real-world DB convention). The helper uses Math.abs.
    const s = computeSummary({
      openingBalance: 0,
      closingBalance: 50,
      lines: [LINE("a", -100, "CREDIT", true), LINE("b", -50, "DEBIT", true)],
    });
    expect(s.clearedIn).toBe(100);
    expect(s.clearedOut).toBe(50);
    expect(s.netCleared).toBe(50);
    expect(s.balanced).toBe(true);
  });
});

describe("computeSummary — balanced tolerance", () => {
  it("treats |diff| within half-paisa as balanced", () => {
    const s = computeSummary({
      openingBalance: 100,
      closingBalance: 100.003,
      lines: [],
    });
    // diff = -0.003 → within 0.005 → balanced
    expect(s.balanced).toBe(true);
  });

  it("|diff| > tolerance is unbalanced", () => {
    const s = computeSummary({
      openingBalance: 100,
      closingBalance: 100.01,
      lines: [],
    });
    expect(s.balanced).toBe(false);
  });
});

describe("computeSummary — realistic worked example", () => {
  it("matches the running summary in the plan's UI sketch", () => {
    // From the plan: opening ₹45,200, statement ₹62,150, all rows ticked
    const lines: ReconciliationLine[] = [
      LINE("rent", 15000, "DEBIT", true),
      LINE("razorpay-1", 12400, "CREDIT", true),
      LINE("razorpay-2", 19750, "CREDIT", true),
      LINE("aws", 2400, "DEBIT", true),
      // money in 12400 + 19750 = 32,150
      // money out 15000 + 2400 = 17,400
      // net cleared = 45200 + 32150 − 17400 = 59,950
      // diff = 59950 − 62150 = -2200 → not balanced
    ];
    const s = computeSummary({
      openingBalance: 45200,
      closingBalance: 62150,
      lines,
    });
    expect(s.clearedIn).toBe(32150);
    expect(s.clearedOut).toBe(17400);
    expect(s.netCleared).toBe(59950);
    expect(s.difference).toBe(-2200);
    expect(s.balanced).toBe(false);
    expect(s.clearedCount).toBe(4);
    expect(s.unclearedCount).toBe(0);
  });

  it("balances when the user adds the missing transactions", () => {
    const lines: ReconciliationLine[] = [
      LINE("rent", 15000, "DEBIT", true),
      LINE("razorpay-1", 12400, "CREDIT", true),
      LINE("razorpay-2", 19750, "CREDIT", true),
      LINE("aws", 2400, "DEBIT", true),
      // missing: ₹2,200 net inflow
      LINE("interest", 2200, "CREDIT", true),
    ];
    const s = computeSummary({
      openingBalance: 45200,
      closingBalance: 62150,
      lines,
    });
    expect(s.balanced).toBe(true);
    expect(s.difference).toBeCloseTo(0, 4);
  });
});

describe("computeSummary — counts", () => {
  it("tracks cleared vs uncleared counts", () => {
    const s = computeSummary({
      openingBalance: 0,
      closingBalance: 0,
      lines: [
        LINE("a", 1, "CREDIT", true),
        LINE("b", 2, "DEBIT", true),
        LINE("c", 3, "CREDIT", false),
      ],
    });
    expect(s.clearedCount).toBe(2);
    expect(s.unclearedCount).toBe(1);
  });
});
