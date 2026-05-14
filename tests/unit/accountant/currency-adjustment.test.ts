import { describe, it, expect } from "vitest";
import {
  validateCurrencyAdjustmentLines,
  buildJeLines,
  summariseCurrencyAdjustment,
  currencyAdjustmentReference,
  type CurrencyAdjustmentInputLine,
} from "@/lib/accounting/currency-adjustment";
import { parseJeReference } from "@/lib/accounting/parse-je-reference";

/**
 * ACCT-C — Tests for the pure helpers that drive Currency
 * Adjustments. The DB-touching action is integration-tested via
 * Playwright; this file pins the validator, JE-line builder,
 * and reference-key round-trip so the math + audit contract can't
 * regress.
 */

const SYS = { fxGainId: "fx-gain", fxLossId: "fx-loss" };

const baseLine: CurrencyAdjustmentInputLine = {
  accountId: "acc-ar",
  kind: "GAIN",
  amount: 1000,
  description: "AR re-mark",
};

describe("currencyAdjustmentReference + parseJeReference round-trip", () => {
  it("emits CADJ:<id>", () => {
    expect(currencyAdjustmentReference("cm-abc")).toBe("CADJ:cm-abc");
  });

  it("round-trips through parseJeReference (the journal-entries list link)", () => {
    const parsed = parseJeReference(currencyAdjustmentReference("cm-xyz"));
    expect(parsed?.kind).toBe("CURRENCY_ADJUSTMENT");
    expect(parsed?.label).toBe("Currency adjustment");
    expect(parsed?.sourceId).toBe("cm-xyz");
    expect(parsed?.sourceHref).toBe(
      "/accountant/currency-adjustments/cm-xyz"
    );
  });
});

describe("validateCurrencyAdjustmentLines", () => {
  it("returns null for a single well-formed line", () => {
    expect(validateCurrencyAdjustmentLines([baseLine])).toBeNull();
  });

  it("flags an empty line list", () => {
    expect(validateCurrencyAdjustmentLines([])).toMatch(/at least one/i);
  });

  it("flags a line missing accountId", () => {
    expect(
      validateCurrencyAdjustmentLines([{ ...baseLine, accountId: "" }])
    ).toMatch(/account on every line/i);
  });

  it("flags a non-positive amount (gain/loss is the sign carrier, amount stays absolute)", () => {
    expect(
      validateCurrencyAdjustmentLines([{ ...baseLine, amount: 0 }])
    ).toMatch(/positive/i);
    expect(
      validateCurrencyAdjustmentLines([{ ...baseLine, amount: -50 }])
    ).toMatch(/positive/i);
  });

  it("flags an unknown kind (forward-compat guard)", () => {
    expect(
      validateCurrencyAdjustmentLines([
        // @ts-expect-error testing the runtime guard
        { ...baseLine, kind: "BREAK_EVEN" },
      ])
    ).toMatch(/unknown.+kind/i);
  });
});

describe("buildJeLines", () => {
  it("GAIN line → DR account, CR SYS-FX-GAIN (asset re-marked up)", () => {
    const lines = buildJeLines(
      [{ ...baseLine, kind: "GAIN", amount: 1000 }],
      SYS
    );
    expect(lines).toEqual([
      {
        accountId: "acc-ar",
        debit: 1000,
        credit: 0,
        description: "AR re-mark",
      },
      {
        accountId: "fx-gain",
        debit: 0,
        credit: 1000,
        description: "AR re-mark",
      },
    ]);
  });

  it("LOSS line → DR SYS-FX-LOSS, CR account (asset marked down)", () => {
    const lines = buildJeLines(
      [{ ...baseLine, kind: "LOSS", amount: 250 }],
      SYS
    );
    expect(lines).toEqual([
      { accountId: "fx-loss", debit: 250, credit: 0, description: "AR re-mark" },
      { accountId: "acc-ar", debit: 0, credit: 250, description: "AR re-mark" },
    ]);
  });

  it("a mixed input produces a balanced JE (Σ DR = Σ CR)", () => {
    const lines = buildJeLines(
      [
        { accountId: "acc-ar", kind: "GAIN", amount: 1000, description: null },
        { accountId: "acc-ap", kind: "LOSS", amount: 250, description: null },
        { accountId: "acc-cash", kind: "GAIN", amount: 75, description: null },
      ],
      SYS
    );
    const dr = lines.reduce((s, l) => s + l.debit, 0);
    const cr = lines.reduce((s, l) => s + l.credit, 0);
    expect(dr).toBe(cr);
    expect(dr).toBe(1000 + 250 + 75);
    // 3 input lines → 6 JE lines (2 per side).
    expect(lines).toHaveLength(6);
  });

  it("a zero-line input yields an empty JE (caller's responsibility to reject)", () => {
    expect(buildJeLines([], SYS)).toEqual([]);
  });
});

describe("summariseCurrencyAdjustment", () => {
  it("nets gains − losses for the header strip", () => {
    const s = summariseCurrencyAdjustment([
      { accountId: "a", kind: "GAIN", amount: 1200, description: null },
      { accountId: "b", kind: "LOSS", amount: 200, description: null },
      { accountId: "c", kind: "GAIN", amount: 50, description: null },
    ]);
    expect(s.totalGain).toBe(1250);
    expect(s.totalLoss).toBe(200);
    expect(s.net).toBe(1050);
  });

  it("a pure-loss adjustment reports a negative net", () => {
    const s = summariseCurrencyAdjustment([
      { accountId: "a", kind: "LOSS", amount: 500, description: null },
    ]);
    expect(s.totalGain).toBe(0);
    expect(s.totalLoss).toBe(500);
    expect(s.net).toBe(-500);
  });
});
