import { describe, it, expect } from "vitest";
import { partitionForBulkArchive } from "@/lib/accounting/coa-bulk";
import {
  COA_SUBTYPES_BY_TYPE,
  ALL_VALID_SUBTYPES,
  isValidSubTypeForType,
  DEFAULT_SUBTYPE_FOR_TYPE,
} from "@/lib/accounting/coa-subtypes";

/**
 * ACCT-E.2 — Tests for the two pure helpers that drive the new
 * bulk-archive flow and the sub-type picker.
 */

// ─────────────── partitionForBulkArchive ───────────────

describe("partitionForBulkArchive", () => {
  it("allows user accounts (no code or non-SYS code)", () => {
    const res = partitionForBulkArchive([
      { id: "a1", code: null },
      { id: "a2", code: "1000" },
      { id: "a3", code: "4000-MARKETING" },
    ]);
    expect(res.allowed).toEqual(["a1", "a2", "a3"]);
    expect(res.refused).toEqual([]);
  });

  it("refuses SYS-* code-protected accounts", () => {
    const res = partitionForBulkArchive([
      { id: "sys1", code: "SYS-AR" },
      { id: "sys2", code: "SYS-FX-GAIN" },
      { id: "user1", code: "5000" },
    ]);
    expect(res.allowed).toEqual(["user1"]);
    expect(res.refused.sort()).toEqual(["sys1", "sys2"]);
  });

  it("handles an empty selection", () => {
    expect(partitionForBulkArchive([])).toEqual({
      allowed: [],
      refused: [],
    });
  });

  it("returns ALL refused when the selection is all SYS-*", () => {
    const res = partitionForBulkArchive([
      { id: "sys1", code: "SYS-AR" },
      { id: "sys2", code: "SYS-AP" },
    ]);
    expect(res.allowed).toEqual([]);
    expect(res.refused.length).toBe(2);
  });

  it("does NOT treat a non-prefix 'SYS' substring as a system code", () => {
    // The guard uses startsWith — "1000-SYS-fallback" is NOT a
    // system account, just a user account that happens to embed
    // the substring "SYS-" later in the code.
    const res = partitionForBulkArchive([
      { id: "u1", code: "1000-SYS-fallback" },
    ]);
    expect(res.allowed).toEqual(["u1"]);
  });
});

// ─────────────── COA_SUBTYPES_BY_TYPE ───────────────

describe("COA_SUBTYPES_BY_TYPE", () => {
  it("covers every AccountType variant (no gaps for the form picker)", () => {
    const types = [
      "ASSET",
      "LIABILITY",
      "EQUITY",
      "INCOME",
      "EXPENSE",
      "COST_OF_GOODS_SOLD",
      "OTHER_INCOME",
      "OTHER_EXPENSE",
    ] as const;
    for (const t of types) {
      expect(COA_SUBTYPES_BY_TYPE[t].length).toBeGreaterThan(0);
    }
  });

  it("ASSET has 7 granular sub-types (Cash, Bank, AR, Other Current Asset, Stock, Fixed Asset, Other Asset)", () => {
    expect(COA_SUBTYPES_BY_TYPE.ASSET).toEqual([
      "Cash",
      "Bank",
      "Accounts Receivable",
      "Other Current Asset",
      "Stock",
      "Fixed Asset",
      "Other Asset",
    ]);
  });

  it("LIABILITY has 5 granular sub-types", () => {
    expect(COA_SUBTYPES_BY_TYPE.LIABILITY).toEqual([
      "Accounts Payable",
      "Credit Card",
      "Other Current Liability",
      "Non Current Liability",
      "Other Liability",
    ]);
  });

  it("ALL_VALID_SUBTYPES is the flat union of every type's list", () => {
    const total = Object.values(COA_SUBTYPES_BY_TYPE).reduce(
      (s, arr) => s + arr.length,
      0
    );
    expect(ALL_VALID_SUBTYPES.length).toBe(total);
  });
});

// ─────────────── isValidSubTypeForType ───────────────

describe("isValidSubTypeForType", () => {
  it("accepts null (broad-type fallback)", () => {
    expect(isValidSubTypeForType("ASSET", null)).toBe(true);
    expect(isValidSubTypeForType("EXPENSE", "")).toBe(true);
  });

  it("accepts a sub-type that's in its type's list", () => {
    expect(isValidSubTypeForType("ASSET", "Cash")).toBe(true);
    expect(isValidSubTypeForType("ASSET", "Fixed Asset")).toBe(true);
    expect(isValidSubTypeForType("LIABILITY", "Non Current Liability")).toBe(
      true
    );
    expect(
      isValidSubTypeForType("COST_OF_GOODS_SOLD", "Cost Of Goods Sold")
    ).toBe(true);
  });

  it("rejects a cross-type mismatch (Cash under EXPENSE)", () => {
    expect(isValidSubTypeForType("EXPENSE", "Cash")).toBe(false);
    expect(isValidSubTypeForType("INCOME", "Fixed Asset")).toBe(false);
    expect(
      isValidSubTypeForType("LIABILITY", "Accounts Receivable")
    ).toBe(false);
  });

  it("rejects an unknown sub-type for any type", () => {
    expect(isValidSubTypeForType("ASSET", "MadeUpCategory")).toBe(false);
  });
});

// ─────────────── DEFAULT_SUBTYPE_FOR_TYPE ───────────────

describe("DEFAULT_SUBTYPE_FOR_TYPE", () => {
  it("every default sub-type IS itself a valid pick for its type", () => {
    const types = Object.keys(DEFAULT_SUBTYPE_FOR_TYPE) as Array<
      keyof typeof DEFAULT_SUBTYPE_FOR_TYPE
    >;
    for (const t of types) {
      const sub = DEFAULT_SUBTYPE_FOR_TYPE[t];
      expect(isValidSubTypeForType(t, sub)).toBe(true);
    }
  });
});
