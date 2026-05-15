import { describe, it, expect } from "vitest";
import {
  buildCashFlowStatement,
  isCashAccount,
  type CashFlowAccountDelta,
} from "@/lib/reports/cash-flow";

/**
 * REPORTS — Pin the indirect-method Cash Flow math. The
 * Operating / Investing / Financing partition is delicate and a
 * mis-bucketed account silently misstates the statement, so each
 * branch gets a dedicated case.
 *
 * Sign convention reminder:
 *   - `rawDelta` is the period-bounded (totalDebit − totalCredit)
 *     for the account.
 *   - For debit-natural accounts (assets), rawDelta > 0 = balance
 *     grew.
 *   - For credit-natural accounts (liabilities / equity), rawDelta
 *     < 0 = balance grew (because credits show as negative in the
 *     debit−credit form).
 *   - In Cash Flow terms an asset rise consumes cash (subtract);
 *     a liability rise sources cash (add). The builder applies
 *     `-rawDelta` for both so the net flow line is correctly signed.
 */

function delta(
  partial: Partial<CashFlowAccountDelta> & { accountName: string; accountType: CashFlowAccountDelta["accountType"] }
): CashFlowAccountDelta {
  return {
    accountId: partial.accountName.toLowerCase().replace(/\s+/g, "-"),
    accountCode: null,
    accountSubType: null,
    rawDelta: 0,
    ...partial,
  };
}

describe("isCashAccount", () => {
  it("ASSET with subType 'Cash' or 'Bank' is cash", () => {
    expect(isCashAccount("ASSET", "Cash")).toBe(true);
    expect(isCashAccount("ASSET", "Bank")).toBe(true);
  });

  it("ASSET with any other subType isn't cash", () => {
    expect(isCashAccount("ASSET", "Other Current Asset")).toBe(false);
    expect(isCashAccount("ASSET", "Fixed Asset")).toBe(false);
    expect(isCashAccount("ASSET", null)).toBe(false);
  });

  it("Non-ASSET accounts are never cash, regardless of subType", () => {
    expect(isCashAccount("LIABILITY", "Cash")).toBe(false);
    expect(isCashAccount("EQUITY", "Bank")).toBe(false);
  });
});

describe("buildCashFlowStatement — empty period", () => {
  it("returns all zeros with full section structure when nothing happened", () => {
    const cf = buildCashFlowStatement({
      beginningCashBalance: 0,
      endingCashBalance: 0,
      netIncome: 0,
      nonCashDeltas: [],
    });
    expect(cf.beginningCashBalance).toBe(0);
    expect(cf.operating.netIncome).toBe(0);
    expect(cf.operating.nonCashAdjustments).toEqual([]);
    expect(cf.operating.nonCashAdjustmentsTotal).toBe(0);
    expect(cf.operating.netCashFromOperating).toBe(0);
    expect(cf.investing.items).toEqual([]);
    expect(cf.investing.netCashFromInvesting).toBe(0);
    expect(cf.financing.items).toEqual([]);
    expect(cf.financing.netCashFromFinancing).toBe(0);
    expect(cf.netChangeInCash).toBe(0);
    expect(cf.endingCashBalance).toBe(0);
  });
});

describe("buildCashFlowStatement — net income only (no working capital changes)", () => {
  it("propagates net income through Operating CF to Net Change", () => {
    const cf = buildCashFlowStatement({
      beginningCashBalance: 100_000,
      endingCashBalance: 150_000,
      netIncome: 50_000,
      nonCashDeltas: [],
    });
    expect(cf.operating.netIncome).toBe(50_000);
    expect(cf.operating.netCashFromOperating).toBe(50_000);
    expect(cf.netChangeInCash).toBe(50_000);
    // Balance identity: Beginning + NetChange = Ending.
    expect(cf.beginningCashBalance + cf.netChangeInCash).toBe(
      cf.endingCashBalance
    );
  });
});

describe("buildCashFlowStatement — Operating section adjustments", () => {
  it("AR increase consumes cash (subtracts from Operating CF)", () => {
    const cf = buildCashFlowStatement({
      beginningCashBalance: 0,
      endingCashBalance: 0,
      netIncome: 100_000,
      nonCashDeltas: [
        // AR rose by 30,000 in the period (more debits than credits
        // on the AR account → rawDelta = +30,000).
        delta({
          accountName: "Accounts Receivable",
          accountType: "ASSET",
          rawDelta: 30_000,
        }),
      ],
    });
    expect(cf.operating.nonCashAdjustmentsTotal).toBe(-30_000);
    expect(cf.operating.netCashFromOperating).toBe(70_000);
  });

  it("AP increase sources cash (adds to Operating CF)", () => {
    const cf = buildCashFlowStatement({
      beginningCashBalance: 0,
      endingCashBalance: 0,
      netIncome: 50_000,
      nonCashDeltas: [
        // AP rose by 20,000 → credit balance grew → rawDelta = -20,000.
        delta({
          accountName: "Accounts Payable",
          accountType: "LIABILITY",
          rawDelta: -20_000,
        }),
      ],
    });
    expect(cf.operating.nonCashAdjustmentsTotal).toBe(20_000);
    expect(cf.operating.netCashFromOperating).toBe(70_000);
  });

  it("Inventory increase consumes cash", () => {
    const cf = buildCashFlowStatement({
      beginningCashBalance: 0,
      endingCashBalance: 0,
      netIncome: 0,
      nonCashDeltas: [
        delta({
          accountName: "Inventory Asset",
          accountType: "ASSET",
          accountSubType: "Stock",
          rawDelta: 15_000,
        }),
      ],
    });
    expect(cf.operating.nonCashAdjustmentsTotal).toBe(-15_000);
    expect(cf.operating.netCashFromOperating).toBe(-15_000);
  });

  it("Other Current Liability increase sources cash", () => {
    const cf = buildCashFlowStatement({
      beginningCashBalance: 0,
      endingCashBalance: 0,
      netIncome: 0,
      nonCashDeltas: [
        delta({
          accountName: "GST Payable",
          accountType: "LIABILITY",
          accountSubType: "Other Current Liability",
          rawDelta: -5_000,
        }),
      ],
    });
    expect(cf.operating.nonCashAdjustmentsTotal).toBe(5_000);
  });
});

describe("buildCashFlowStatement — Investing activities", () => {
  it("Fixed Asset purchase consumes cash (negative Investing CF)", () => {
    const cf = buildCashFlowStatement({
      beginningCashBalance: 0,
      endingCashBalance: 0,
      netIncome: 0,
      nonCashDeltas: [
        delta({
          accountName: "Office Equipment",
          accountType: "ASSET",
          accountSubType: "Fixed Asset",
          rawDelta: 200_000, // bought equipment worth 2L
        }),
      ],
    });
    expect(cf.investing.netCashFromInvesting).toBe(-200_000);
    expect(cf.investing.items).toHaveLength(1);
  });

  it("Non Current Asset (e.g. long-term investment) is also Investing", () => {
    const cf = buildCashFlowStatement({
      beginningCashBalance: 0,
      endingCashBalance: 0,
      netIncome: 0,
      nonCashDeltas: [
        delta({
          accountName: "Long Term Investment",
          accountType: "ASSET",
          accountSubType: "Non Current Asset",
          rawDelta: 100_000,
        }),
      ],
    });
    expect(cf.investing.netCashFromInvesting).toBe(-100_000);
  });
});

describe("buildCashFlowStatement — Financing activities", () => {
  it("Long-term loan increase sources cash (positive Financing CF)", () => {
    const cf = buildCashFlowStatement({
      beginningCashBalance: 0,
      endingCashBalance: 0,
      netIncome: 0,
      nonCashDeltas: [
        delta({
          accountName: "Bank Loan",
          accountType: "LIABILITY",
          accountSubType: "Non Current Liability",
          rawDelta: -500_000, // received 5L loan
        }),
      ],
    });
    expect(cf.financing.netCashFromFinancing).toBe(500_000);
  });

  it("Equity contribution sources cash", () => {
    const cf = buildCashFlowStatement({
      beginningCashBalance: 0,
      endingCashBalance: 0,
      netIncome: 0,
      nonCashDeltas: [
        delta({
          accountName: "Capital",
          accountType: "EQUITY",
          accountSubType: "Equity",
          rawDelta: -1_000_000,
        }),
      ],
    });
    expect(cf.financing.netCashFromFinancing).toBe(1_000_000);
  });
});

describe("buildCashFlowStatement — cash accounts are ignored", () => {
  it("does not adjust for cash/bank account deltas", () => {
    const cf = buildCashFlowStatement({
      beginningCashBalance: 0,
      endingCashBalance: 0,
      netIncome: 0,
      nonCashDeltas: [
        delta({
          accountName: "Petty Cash",
          accountType: "ASSET",
          accountSubType: "Cash",
          rawDelta: 50_000,
        }),
        delta({
          accountName: "HDFC Current",
          accountType: "ASSET",
          accountSubType: "Bank",
          rawDelta: -10_000,
        }),
      ],
    });
    expect(cf.operating.nonCashAdjustments).toEqual([]);
    expect(cf.investing.items).toEqual([]);
    expect(cf.financing.items).toEqual([]);
  });
});

describe("buildCashFlowStatement — zero-delta accounts are dropped", () => {
  it("doesn't emit empty adjustment lines", () => {
    const cf = buildCashFlowStatement({
      beginningCashBalance: 0,
      endingCashBalance: 0,
      netIncome: 0,
      nonCashDeltas: [
        delta({
          accountName: "Some Account",
          accountType: "ASSET",
          accountSubType: "Other Current Asset",
          rawDelta: 0,
        }),
      ],
    });
    expect(cf.operating.nonCashAdjustments).toEqual([]);
  });
});

describe("buildCashFlowStatement — integration: realistic period", () => {
  it("end-to-end: net income + AR rise + AP rise + capex sums correctly", () => {
    const cf = buildCashFlowStatement({
      beginningCashBalance: 500_000,
      endingCashBalance: 700_000,
      netIncome: 300_000,
      nonCashDeltas: [
        delta({
          accountName: "Accounts Receivable",
          accountType: "ASSET",
          rawDelta: 80_000, // AR rose
        }),
        delta({
          accountName: "Accounts Payable",
          accountType: "LIABILITY",
          rawDelta: -30_000, // AP rose
        }),
        delta({
          accountName: "Office Equipment",
          accountType: "ASSET",
          accountSubType: "Fixed Asset",
          rawDelta: 100_000, // bought equipment
        }),
        delta({
          accountName: "Bank Loan",
          accountType: "LIABILITY",
          accountSubType: "Non Current Liability",
          rawDelta: -50_000, // took loan
        }),
      ],
    });
    // Operating CF = 300_000 + (-80_000) + 30_000 = 250_000
    expect(cf.operating.netCashFromOperating).toBe(250_000);
    // Investing CF = -100_000
    expect(cf.investing.netCashFromInvesting).toBe(-100_000);
    // Financing CF = 50_000
    expect(cf.financing.netCashFromFinancing).toBe(50_000);
    // Net Change = 250_000 - 100_000 + 50_000 = 200_000
    expect(cf.netChangeInCash).toBe(200_000);
    // Identity: Beginning + NetChange = Ending
    expect(cf.beginningCashBalance + cf.netChangeInCash).toBe(
      cf.endingCashBalance
    );
  });
});
