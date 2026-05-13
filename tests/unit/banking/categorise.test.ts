import { describe, it, expect } from "vitest";
import {
  categorisedRecordType,
  validateGLForDirection,
  assertSameDirection,
  VALID_ACCOUNT_TYPES,
} from "@/lib/banking/categorise";

/**
 * Tests for BNK-D Categorise helpers.
 *
 * Pure functions — no DB. The server action uses these to validate
 * the user's GL pick BEFORE writing anything (atomic safety).
 */

describe("categorisedRecordType", () => {
  it("DEBIT (money out) → EXPENSE", () => {
    expect(categorisedRecordType("DEBIT")).toBe("EXPENSE");
  });
  it("CREDIT (money in) → JOURNAL_ENTRY", () => {
    expect(categorisedRecordType("CREDIT")).toBe("JOURNAL_ENTRY");
  });
});

describe("validateGLForDirection", () => {
  it("DEBIT + EXPENSE → ok", () => {
    expect(validateGLForDirection("DEBIT", "EXPENSE")).toBeNull();
  });
  it("DEBIT + COST_OF_GOODS_SOLD → ok", () => {
    expect(validateGLForDirection("DEBIT", "COST_OF_GOODS_SOLD")).toBeNull();
  });
  it("CREDIT + INCOME → ok", () => {
    expect(validateGLForDirection("CREDIT", "INCOME")).toBeNull();
  });
  it("CREDIT + OTHER_INCOME → ok", () => {
    expect(validateGLForDirection("CREDIT", "OTHER_INCOME")).toBeNull();
  });
  it("DEBIT + INCOME → error", () => {
    const msg = validateGLForDirection("DEBIT", "INCOME");
    expect(msg).toMatch(/expense account/i);
  });
  it("CREDIT + EXPENSE → error", () => {
    const msg = validateGLForDirection("CREDIT", "EXPENSE");
    expect(msg).toMatch(/income account/i);
  });
  it("rejects ASSET / LIABILITY / EQUITY in either direction", () => {
    for (const t of ["ASSET", "LIABILITY", "EQUITY", "OTHER_EXPENSE"] as const) {
      expect(validateGLForDirection("DEBIT", t)).not.toBeNull();
      expect(validateGLForDirection("CREDIT", t)).not.toBeNull();
    }
  });
});

describe("VALID_ACCOUNT_TYPES", () => {
  it("DEBIT and CREDIT account sets don't overlap (no double-classification)", () => {
    const d = new Set(VALID_ACCOUNT_TYPES.DEBIT);
    const c = new Set(VALID_ACCOUNT_TYPES.CREDIT);
    for (const t of d) expect(c.has(t)).toBe(false);
  });
});

describe("assertSameDirection", () => {
  it("returns the direction when all lines agree", () => {
    const res = assertSameDirection([
      { type: "DEBIT" },
      { type: "DEBIT" },
      { type: "DEBIT" },
    ]);
    expect(res).toEqual({ direction: "DEBIT" });
  });
  it("returns error when directions are mixed", () => {
    const res = assertSameDirection([
      { type: "DEBIT" },
      { type: "CREDIT" },
    ]);
    expect("error" in res).toBe(true);
    if ("error" in res) {
      expect(res.error).toMatch(/same direction/i);
    }
  });
  it("returns error when no lines passed in", () => {
    const res = assertSameDirection([]);
    expect("error" in res).toBe(true);
  });
  it("single-line input is trivially same-direction", () => {
    const res = assertSameDirection([{ type: "CREDIT" }]);
    expect(res).toEqual({ direction: "CREDIT" });
  });
});
