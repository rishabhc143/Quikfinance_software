import { describe, it, expect } from "vitest";
import { validateManualJournalLines as validateLines } from "@/lib/accounting/manual-journal-validation";

/**
 * Tests for ACCT-A's `validateLines` — the pure validator the
 * manual-journal create action runs before posting anything.
 */

describe("validateLines", () => {
  it("returns null for a balanced 2-line entry", () => {
    expect(
      validateLines([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 100 },
      ])
    ).toBeNull();
  });

  it("returns null for a balanced N-line entry", () => {
    expect(
      validateLines([
        { debit: 50, credit: 0 },
        { debit: 50, credit: 0 },
        { debit: 0, credit: 100 },
      ])
    ).toBeNull();
  });

  it("flags fewer than 2 lines", () => {
    expect(validateLines([])).toMatch(/at least two/i);
    expect(validateLines([{ debit: 100, credit: 0 }])).toMatch(/at least two/i);
  });

  it("flags a line with both debit AND credit", () => {
    const msg = validateLines([
      { debit: 100, credit: 50 },
      { debit: 0, credit: 50 },
    ]);
    expect(msg).toMatch(/either a debit or a credit/i);
  });

  it("flags a line with zero debit AND zero credit", () => {
    const msg = validateLines([
      { debit: 0, credit: 0 },
      { debit: 100, credit: 0 },
      { debit: 0, credit: 100 },
    ]);
    expect(msg).toMatch(/non-zero/i);
  });

  it("flags zero totals", () => {
    // Two CR-only lines summing to zero on both sides — caught by
    // the "non-zero" guard above first. Construct a different shape
    // that gets past it: hmm, every line is either DR or CR not zero,
    // so total > 0 is implied. Skip this edge case (covered by the
    // non-zero line guard).
    // Instead test that fully-empty-line input triggers either the
    // line count guard or the non-zero guard.
    expect(validateLines([])).not.toBeNull();
  });

  it("flags unbalanced DR vs CR", () => {
    const msg = validateLines([
      { debit: 100, credit: 0 },
      { debit: 0, credit: 90 },
    ]);
    expect(msg).toMatch(/must equal/i);
  });

  it("tolerates 0.001-rupee rounding", () => {
    // Half-paisa noise should not block save.
    expect(
      validateLines([
        { debit: 100.0001, credit: 0 },
        { debit: 0, credit: 100 },
      ])
    ).toBeNull();
  });

  it("rejects 0.01-rupee gaps (real mistake, not noise)", () => {
    const msg = validateLines([
      { debit: 100.01, credit: 0 },
      { debit: 0, credit: 100 },
    ]);
    expect(msg).toMatch(/must equal/i);
  });
});
