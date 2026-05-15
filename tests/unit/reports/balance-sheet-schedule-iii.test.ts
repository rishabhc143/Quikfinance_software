import { describe, it, expect } from "vitest";
import {
  buildScheduleIIIBalanceSheet,
  bucketForSch3Bs,
  type Sch3BsInput,
} from "@/lib/reports/balance-sheet-schedule-iii";

/**
 * REPORTS — Balance Sheet (Schedule III) tests.
 *
 * Pins the account → Schedule III bucket routing and the totals
 * arithmetic. The Schedule III layout is rigid (Companies Act
 * 2013 prescribes the line items) so the rollup invariants
 * matter: Equity & Liabilities total must equal Assets total
 * when the books balance.
 */

function input(
  partial: Partial<Sch3BsInput> & {
    accountName: string;
    accountType: Sch3BsInput["accountType"];
    netBalance: number;
  }
): Sch3BsInput {
  return {
    accountSubType: null,
    ...partial,
  };
}

describe("bucketForSch3Bs", () => {
  // Equity routing
  it("EQUITY 'Share Capital' → share-capital", () => {
    expect(
      bucketForSch3Bs({
        accountType: "EQUITY",
        accountName: "Share Capital",
        accountSubType: "Equity",
      })
    ).toBe("share-capital");
  });

  it("EQUITY 'Retained Earnings' → reserves-and-surplus", () => {
    expect(
      bucketForSch3Bs({
        accountType: "EQUITY",
        accountName: "Retained Earnings",
        accountSubType: "Equity",
      })
    ).toBe("reserves-and-surplus");
  });

  it("EQUITY 'Share Application Money' → share-application-pending", () => {
    expect(
      bucketForSch3Bs({
        accountType: "EQUITY",
        accountName: "Share Application Money",
        accountSubType: "Equity",
      })
    ).toBe("share-application-pending");
  });

  // Liabilities routing
  it("LIABILITY 'Accounts Payable' → trade-payables", () => {
    expect(
      bucketForSch3Bs({
        accountType: "LIABILITY",
        accountName: "Accounts Payable",
        accountSubType: "Other Current Liability",
      })
    ).toBe("trade-payables");
  });

  it("LIABILITY 'Sundry Creditors' → trade-payables", () => {
    expect(
      bucketForSch3Bs({
        accountType: "LIABILITY",
        accountName: "Sundry Creditors",
        accountSubType: "Other Current Liability",
      })
    ).toBe("trade-payables");
  });

  it("LIABILITY 'Term Loan' subType=Non Current → long-term-borrowings", () => {
    expect(
      bucketForSch3Bs({
        accountType: "LIABILITY",
        accountName: "Bank Term Loan",
        accountSubType: "Non Current Liability",
      })
    ).toBe("long-term-borrowings");
  });

  it("LIABILITY 'Provision for Gratuity' subType=Non Current → long-term-provisions", () => {
    expect(
      bucketForSch3Bs({
        accountType: "LIABILITY",
        accountName: "Provision for Gratuity",
        accountSubType: "Non Current Liability",
      })
    ).toBe("long-term-provisions");
  });

  it("LIABILITY 'GST Payable' → other-current-liabilities", () => {
    expect(
      bucketForSch3Bs({
        accountType: "LIABILITY",
        accountName: "GST Payable",
        accountSubType: "Other Current Liability",
      })
    ).toBe("other-current-liabilities");
  });

  it("LIABILITY 'Deferred Tax Liability' → deferred-tax-liabilities", () => {
    expect(
      bucketForSch3Bs({
        accountType: "LIABILITY",
        accountName: "Deferred Tax Liability",
        accountSubType: null,
      })
    ).toBe("deferred-tax-liabilities");
  });

  // Assets routing
  it("ASSET subType=Cash → cash-and-cash-equivalents", () => {
    expect(
      bucketForSch3Bs({
        accountType: "ASSET",
        accountName: "Petty Cash",
        accountSubType: "Cash",
      })
    ).toBe("cash-and-cash-equivalents");
  });

  it("ASSET subType=Bank → cash-and-cash-equivalents", () => {
    expect(
      bucketForSch3Bs({
        accountType: "ASSET",
        accountName: "HDFC Current",
        accountSubType: "Bank",
      })
    ).toBe("cash-and-cash-equivalents");
  });

  it("ASSET 'Accounts Receivable' → trade-receivables", () => {
    expect(
      bucketForSch3Bs({
        accountType: "ASSET",
        accountName: "Accounts Receivable",
        accountSubType: "Other Current Asset",
      })
    ).toBe("trade-receivables");
  });

  it("ASSET subType=Stock → inventories", () => {
    expect(
      bucketForSch3Bs({
        accountType: "ASSET",
        accountName: "Inventory Asset",
        accountSubType: "Stock",
      })
    ).toBe("inventories");
  });

  it("ASSET subType=Fixed Asset → tangible-assets by default", () => {
    expect(
      bucketForSch3Bs({
        accountType: "ASSET",
        accountName: "Office Equipment",
        accountSubType: "Fixed Asset",
      })
    ).toBe("tangible-assets");
  });

  it("ASSET 'Goodwill' Fixed Asset → intangible-assets", () => {
    expect(
      bucketForSch3Bs({
        accountType: "ASSET",
        accountName: "Goodwill",
        accountSubType: "Fixed Asset",
      })
    ).toBe("intangible-assets");
  });

  it("ASSET 'Capital Work in Progress' → capital-work-in-progress", () => {
    expect(
      bucketForSch3Bs({
        accountType: "ASSET",
        accountName: "Capital Work in Progress",
        accountSubType: "Fixed Asset",
      })
    ).toBe("capital-work-in-progress");
  });

  it("ASSET subType=Non Current Asset 'Long Term Loan' → long-term-loans-and-advances", () => {
    expect(
      bucketForSch3Bs({
        accountType: "ASSET",
        accountName: "Long Term Loan to Subsidiary",
        accountSubType: "Non Current Asset",
      })
    ).toBe("long-term-loans-and-advances");
  });

  it("ASSET 'Deferred Tax Asset' → deferred-tax-assets", () => {
    expect(
      bucketForSch3Bs({
        accountType: "ASSET",
        accountName: "Deferred Tax Asset",
        accountSubType: null,
      })
    ).toBe("deferred-tax-assets");
  });

  it("ASSET 'Other Current Asset (unmatched)' → other-current-assets", () => {
    expect(
      bucketForSch3Bs({
        accountType: "ASSET",
        accountName: "Prepaid Insurance",
        accountSubType: "Other Current Asset",
      })
    ).toBe("other-current-assets");
  });
});

describe("buildScheduleIIIBalanceSheet", () => {
  it("empty input → all zeros, both sides total to 0", () => {
    const bs = buildScheduleIIIBalanceSheet([]);
    expect(bs.equityAndLiabilities.total).toBe(0);
    expect(bs.assets.total).toBe(0);
  });

  it("balanced books: Cash 100k + Capital 100k → equal totals", () => {
    const bs = buildScheduleIIIBalanceSheet([
      input({
        accountType: "ASSET",
        accountName: "Cash",
        accountSubType: "Cash",
        netBalance: 100_000,
      }),
      input({
        accountType: "EQUITY",
        accountName: "Share Capital",
        accountSubType: "Equity",
        netBalance: 100_000,
      }),
    ]);
    expect(bs.assets.total).toBe(100_000);
    expect(bs.equityAndLiabilities.total).toBe(100_000);
    expect(bs.assets.currentAssets.cashAndCashEquivalents).toBe(100_000);
    expect(bs.equityAndLiabilities.shareholdersFunds.shareCapital).toBe(
      100_000
    );
  });

  it("rolls up Non-Current Liabilities correctly", () => {
    const bs = buildScheduleIIIBalanceSheet([
      input({
        accountType: "LIABILITY",
        accountName: "Bank Term Loan",
        accountSubType: "Non Current Liability",
        netBalance: 500_000,
      }),
      input({
        accountType: "LIABILITY",
        accountName: "Provision for Gratuity",
        accountSubType: "Non Current Liability",
        netBalance: 50_000,
      }),
    ]);
    expect(bs.equityAndLiabilities.nonCurrentLiabilities.longTermBorrowings).toBe(
      500_000
    );
    expect(bs.equityAndLiabilities.nonCurrentLiabilities.longTermProvisions).toBe(
      50_000
    );
    expect(bs.equityAndLiabilities.nonCurrentLiabilities.total).toBe(550_000);
  });

  it("rolls up Fixed Assets sub-buckets", () => {
    const bs = buildScheduleIIIBalanceSheet([
      input({
        accountType: "ASSET",
        accountName: "Plant & Machinery",
        accountSubType: "Fixed Asset",
        netBalance: 1_000_000,
      }),
      input({
        accountType: "ASSET",
        accountName: "Goodwill",
        accountSubType: "Fixed Asset",
        netBalance: 200_000,
      }),
      input({
        accountType: "ASSET",
        accountName: "Capital Work in Progress",
        accountSubType: "Fixed Asset",
        netBalance: 100_000,
      }),
    ]);
    expect(bs.assets.nonCurrentAssets.fixedAssets.tangibleAssets).toBe(
      1_000_000
    );
    expect(bs.assets.nonCurrentAssets.fixedAssets.intangibleAssets).toBe(
      200_000
    );
    expect(bs.assets.nonCurrentAssets.fixedAssets.capitalWorkInProgress).toBe(
      100_000
    );
    expect(bs.assets.nonCurrentAssets.fixedAssets.total).toBe(1_300_000);
  });

  it("integration: full mini balance sheet, both sides balance", () => {
    const bs = buildScheduleIIIBalanceSheet([
      // Assets
      input({
        accountType: "ASSET",
        accountName: "HDFC Current",
        accountSubType: "Bank",
        netBalance: 200_000,
      }),
      input({
        accountType: "ASSET",
        accountName: "Accounts Receivable",
        accountSubType: "Other Current Asset",
        netBalance: 300_000,
      }),
      input({
        accountType: "ASSET",
        accountName: "Inventory Asset",
        accountSubType: "Stock",
        netBalance: 150_000,
      }),
      input({
        accountType: "ASSET",
        accountName: "Plant & Machinery",
        accountSubType: "Fixed Asset",
        netBalance: 800_000,
      }),
      // Liabilities + Equity
      input({
        accountType: "LIABILITY",
        accountName: "Accounts Payable",
        accountSubType: "Other Current Liability",
        netBalance: 100_000,
      }),
      input({
        accountType: "LIABILITY",
        accountName: "Bank Term Loan",
        accountSubType: "Non Current Liability",
        netBalance: 500_000,
      }),
      input({
        accountType: "EQUITY",
        accountName: "Share Capital",
        accountSubType: "Equity",
        netBalance: 500_000,
      }),
      input({
        accountType: "EQUITY",
        accountName: "Retained Earnings",
        accountSubType: "Equity",
        netBalance: 350_000,
      }),
    ]);
    // Assets total: 200k + 300k + 150k + 800k = 1,450k
    expect(bs.assets.total).toBe(1_450_000);
    // E&L total: 100k + 500k + 500k + 350k = 1,450k
    expect(bs.equityAndLiabilities.total).toBe(1_450_000);
    // Books balance identity
    expect(bs.assets.total).toBe(bs.equityAndLiabilities.total);
  });
});
