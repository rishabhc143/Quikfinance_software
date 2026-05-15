import { describe, it, expect } from "vitest";
import {
  buildScheduleIIIPnl,
  bucketForScheduleIII,
} from "@/lib/reports/profit-loss-schedule-iii";
import type { LedgerRow } from "@/lib/reports/ledger-aggregation";

/**
 * REPORTS — Schedule III P&L tests.
 *
 * Pins the name-based routing heuristic and the 15-section
 * arithmetic. The bucket rules are fragile to copy mistakes in
 * the regex set, so each major branch gets at least one named
 * test.
 */

function row(
  partial: Partial<LedgerRow> & {
    accountName: string;
    accountType: LedgerRow["accountType"];
    netBalance: number;
  }
): LedgerRow {
  return {
    accountId: partial.accountName.toLowerCase().replace(/\s+/g, "-"),
    accountCode: null,
    totalDebit: 0,
    totalCredit: 0,
    ...partial,
  };
}

describe("bucketForScheduleIII", () => {
  it("INCOME → revenue-from-operations", () => {
    expect(
      bucketForScheduleIII({ accountType: "INCOME", accountName: "Sales" })
    ).toBe("revenue-from-operations");
  });

  it("OTHER_INCOME → other-income", () => {
    expect(
      bucketForScheduleIII({
        accountType: "OTHER_INCOME",
        accountName: "Interest Earned",
      })
    ).toBe("other-income");
  });

  it("COGS 'Material consumed' → cost-of-materials-consumed", () => {
    expect(
      bucketForScheduleIII({
        accountType: "COST_OF_GOODS_SOLD",
        accountName: "Raw Material Consumed",
      })
    ).toBe("cost-of-materials-consumed");
  });

  it("COGS 'Purchase of goods' → purchases-of-stock-in-trade", () => {
    expect(
      bucketForScheduleIII({
        accountType: "COST_OF_GOODS_SOLD",
        accountName: "Purchase of finished goods",
      })
    ).toBe("purchases-of-stock-in-trade");
  });

  it("COGS 'Stock in Trade' name → purchases-of-stock-in-trade", () => {
    expect(
      bucketForScheduleIII({
        accountType: "COST_OF_GOODS_SOLD",
        accountName: "Stock in Trade Movement",
      })
    ).toBe("purchases-of-stock-in-trade");
  });

  it("COGS 'Inventory variance' → changes-in-inventory", () => {
    expect(
      bucketForScheduleIII({
        accountType: "COST_OF_GOODS_SOLD",
        accountName: "Inventory Variance Account",
      })
    ).toBe("changes-in-inventory");
  });

  it("EXPENSE 'Salaries' → employee-benefits", () => {
    expect(
      bucketForScheduleIII({
        accountType: "EXPENSE",
        accountName: "Salaries and Wages",
      })
    ).toBe("employee-benefits");
  });

  it("EXPENSE 'PF Contribution' → employee-benefits", () => {
    expect(
      bucketForScheduleIII({
        accountType: "EXPENSE",
        accountName: "PF Contribution",
      })
    ).toBe("employee-benefits");
  });

  it("EXPENSE 'Gratuity Provision' → employee-benefits", () => {
    expect(
      bucketForScheduleIII({
        accountType: "EXPENSE",
        accountName: "Gratuity Provision",
      })
    ).toBe("employee-benefits");
  });

  it("EXPENSE 'Bank Interest' → finance-costs", () => {
    expect(
      bucketForScheduleIII({
        accountType: "EXPENSE",
        accountName: "Bank Interest Expense",
      })
    ).toBe("finance-costs");
  });

  it("EXPENSE 'Bank Charges' → finance-costs", () => {
    expect(
      bucketForScheduleIII({
        accountType: "EXPENSE",
        accountName: "Bank Charges",
      })
    ).toBe("finance-costs");
  });

  it("EXPENSE 'Depreciation' → depreciation-amortization", () => {
    expect(
      bucketForScheduleIII({
        accountType: "EXPENSE",
        accountName: "Depreciation on Plant",
      })
    ).toBe("depreciation-amortization");
  });

  it("EXPENSE 'Amortisation' (UK spelling) → depreciation-amortization", () => {
    expect(
      bucketForScheduleIII({
        accountType: "EXPENSE",
        accountName: "Amortisation of Goodwill",
      })
    ).toBe("depreciation-amortization");
  });

  it("EXPENSE 'Income Tax' → current-tax", () => {
    expect(
      bucketForScheduleIII({
        accountType: "EXPENSE",
        accountName: "Income Tax",
      })
    ).toBe("current-tax");
  });

  it("EXPENSE 'Deferred Tax Expense' → deferred-tax", () => {
    expect(
      bucketForScheduleIII({
        accountType: "EXPENSE",
        accountName: "Deferred Tax Expense",
      })
    ).toBe("deferred-tax");
  });

  it("EXPENSE 'Office Rent' (unmatched) → other-expenses", () => {
    expect(
      bucketForScheduleIII({
        accountType: "EXPENSE",
        accountName: "Office Rent",
      })
    ).toBe("other-expenses");
  });

  it("OTHER_EXPENSE 'Forex Loss' → exceptional-items", () => {
    expect(
      bucketForScheduleIII({
        accountType: "OTHER_EXPENSE",
        accountName: "Forex Loss",
      })
    ).toBe("exceptional-items");
  });

  it("EXPENSE 'Extraordinary Loss on Fire' → extraordinary-items", () => {
    expect(
      bucketForScheduleIII({
        accountType: "OTHER_EXPENSE",
        accountName: "Extraordinary Loss on Fire",
      })
    ).toBe("extraordinary-items");
  });
});

describe("buildScheduleIIIPnl", () => {
  it("empty input → all zeros, balanced", () => {
    const r = buildScheduleIIIPnl([]);
    expect(r.totalRevenue).toBe(0);
    expect(r.expenses.total).toBe(0);
    expect(r.profitForPeriod).toBe(0);
  });

  it("profitable period: Revenue 1M, Expenses 600k → Profit 400k", () => {
    const r = buildScheduleIIIPnl([
      row({ accountType: "INCOME", accountName: "Sales", netBalance: 1_000_000 }),
      row({
        accountType: "EXPENSE",
        accountName: "Salaries",
        netBalance: 400_000,
      }),
      row({
        accountType: "EXPENSE",
        accountName: "Office Rent",
        netBalance: 200_000,
      }),
    ]);
    expect(r.revenueFromOperations).toBe(1_000_000);
    expect(r.otherIncome).toBe(0);
    expect(r.totalRevenue).toBe(1_000_000);
    expect(r.expenses.employeeBenefits).toBe(400_000);
    expect(r.expenses.otherExpenses).toBe(200_000);
    expect(r.expenses.total).toBe(600_000);
    expect(r.profitBeforeExceptionalAndExtraordinary).toBe(400_000);
    expect(r.profitBeforeTax).toBe(400_000);
    expect(r.profitFromContinuingOperations).toBe(400_000);
    expect(r.profitForPeriod).toBe(400_000);
  });

  it("subtracts current + deferred tax from profit before tax", () => {
    const r = buildScheduleIIIPnl([
      row({ accountType: "INCOME", accountName: "Sales", netBalance: 1_000_000 }),
      row({
        accountType: "EXPENSE",
        accountName: "Income Tax",
        netBalance: 100_000,
      }),
      row({
        accountType: "EXPENSE",
        accountName: "Deferred Tax Expense",
        netBalance: 20_000,
      }),
    ]);
    expect(r.taxExpense.currentTax).toBe(100_000);
    expect(r.taxExpense.deferredTax).toBe(20_000);
    expect(r.taxExpense.total).toBe(120_000);
    // Revenue 1M − 0 expenses (tax goes to tax expense, not expenses)
    expect(r.profitBeforeTax).toBe(1_000_000);
    // After tax: 1M − 120k = 880k
    expect(r.profitFromContinuingOperations).toBe(880_000);
  });

  it("exceptional items deducted before extraordinary", () => {
    const r = buildScheduleIIIPnl([
      row({ accountType: "INCOME", accountName: "Sales", netBalance: 500_000 }),
      row({
        accountType: "OTHER_EXPENSE",
        accountName: "Forex Loss",
        netBalance: 50_000, // exceptional
      }),
      row({
        accountType: "OTHER_EXPENSE",
        accountName: "Extraordinary Loss on Lawsuit",
        netBalance: 30_000,
      }),
    ]);
    expect(r.exceptionalItems).toBe(50_000);
    expect(r.extraordinaryItems).toBe(30_000);
    expect(r.profitBeforeExceptionalAndExtraordinary).toBe(500_000);
    expect(r.profitBeforeExtraordinary).toBe(450_000);
    expect(r.profitBeforeTax).toBe(420_000);
  });

  it("XV = XI + XIV identity holds", () => {
    const r = buildScheduleIIIPnl([
      row({ accountType: "INCOME", accountName: "Sales", netBalance: 800_000 }),
      row({
        accountType: "EXPENSE",
        accountName: "Salary",
        netBalance: 200_000,
      }),
      row({
        accountType: "EXPENSE",
        accountName: "Bank Interest",
        netBalance: 50_000,
      }),
      row({
        accountType: "EXPENSE",
        accountName: "Income Tax",
        netBalance: 100_000,
      }),
    ]);
    expect(r.profitForPeriod).toBe(
      r.profitFromContinuingOperations + r.profitFromDiscontinuingAfterTax
    );
  });

  it("each expense line populates its specific bucket only", () => {
    const r = buildScheduleIIIPnl([
      row({ accountType: "INCOME", accountName: "Sales", netBalance: 1_000_000 }),
      row({
        accountType: "EXPENSE",
        accountName: "Salaries",
        netBalance: 100_000,
      }),
      row({
        accountType: "EXPENSE",
        accountName: "Bank Interest",
        netBalance: 50_000,
      }),
      row({
        accountType: "EXPENSE",
        accountName: "Depreciation",
        netBalance: 80_000,
      }),
      row({
        accountType: "COST_OF_GOODS_SOLD",
        accountName: "Raw Material Consumed",
        netBalance: 200_000,
      }),
    ]);
    expect(r.expenses.employeeBenefits).toBe(100_000);
    expect(r.expenses.financeCosts).toBe(50_000);
    expect(r.expenses.depreciationAndAmortization).toBe(80_000);
    expect(r.expenses.costOfMaterialsConsumed).toBe(200_000);
    expect(r.expenses.otherExpenses).toBe(0);
    expect(r.expenses.total).toBe(430_000);
  });
});
