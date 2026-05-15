import { describe, it, expect } from "vitest";
import { buildProfitAndLoss } from "@/lib/reports/profit-loss";
import type { LedgerRow } from "@/lib/reports/ledger-aggregation";

/**
 * REPORTS — Pin the Zoho-style Profit and Loss math. Bugs here
 * mis-state every accountant's primary KPI, so the section
 * totals + subtotal formulas (Gross Profit, Operating Profit,
 * Net Profit/Loss) each get explicit boundary cases.
 */

function row(
  partial: Pick<LedgerRow, "accountId" | "accountName" | "accountType"> &
    Partial<LedgerRow>
): LedgerRow {
  return {
    accountCode: null,
    totalDebit: 0,
    totalCredit: 0,
    netBalance: 0,
    ...partial,
  };
}

describe("buildProfitAndLoss — empty ledger", () => {
  it("returns all sections with zero totals when no rows are passed", () => {
    const pnl = buildProfitAndLoss([]);
    expect(pnl.operatingIncome.total).toBe(0);
    expect(pnl.operatingIncome.accounts).toEqual([]);
    expect(pnl.costOfGoodsSold.total).toBe(0);
    expect(pnl.grossProfit).toBe(0);
    expect(pnl.operatingExpense.total).toBe(0);
    expect(pnl.operatingProfit).toBe(0);
    expect(pnl.nonOperatingIncome.total).toBe(0);
    expect(pnl.nonOperatingExpense.total).toBe(0);
    expect(pnl.netProfitLoss).toBe(0);
  });

  it("uses canonical Zoho section labels", () => {
    const pnl = buildProfitAndLoss([]);
    expect(pnl.operatingIncome.label).toBe("Operating Income");
    expect(pnl.costOfGoodsSold.label).toBe("Cost of Goods Sold");
    expect(pnl.operatingExpense.label).toBe("Operating Expense");
    expect(pnl.nonOperatingIncome.label).toBe("Non Operating Income");
    expect(pnl.nonOperatingExpense.label).toBe("Non Operating Expense");
  });
});

describe("buildProfitAndLoss — straightforward profitable period", () => {
  const ledger: LedgerRow[] = [
    row({
      accountId: "i1",
      accountName: "Sales",
      accountType: "INCOME",
      accountCode: "4000",
      netBalance: 100_000,
    }),
    row({
      accountId: "i2",
      accountName: "Service Revenue",
      accountType: "INCOME",
      accountCode: "4100",
      netBalance: 30_000,
    }),
    row({
      accountId: "c1",
      accountName: "COGS",
      accountType: "COST_OF_GOODS_SOLD",
      accountCode: "5000",
      netBalance: 40_000,
    }),
    row({
      accountId: "e1",
      accountName: "Rent",
      accountType: "EXPENSE",
      accountCode: "6000",
      netBalance: 12_000,
    }),
    row({
      accountId: "e2",
      accountName: "Salaries",
      accountType: "EXPENSE",
      accountCode: "6100",
      netBalance: 35_000,
    }),
    row({
      accountId: "oi1",
      accountName: "Interest Income",
      accountType: "OTHER_INCOME",
      accountCode: "4900",
      netBalance: 500,
    }),
    row({
      accountId: "oe1",
      accountName: "Bank Charges",
      accountType: "OTHER_EXPENSE",
      accountCode: "6900",
      netBalance: 200,
    }),
  ];

  const pnl = buildProfitAndLoss(ledger);

  it("groups accounts under the correct section", () => {
    expect(pnl.operatingIncome.accounts).toHaveLength(2);
    expect(pnl.operatingIncome.total).toBe(130_000);
    expect(pnl.costOfGoodsSold.accounts).toHaveLength(1);
    expect(pnl.costOfGoodsSold.total).toBe(40_000);
    expect(pnl.operatingExpense.accounts).toHaveLength(2);
    expect(pnl.operatingExpense.total).toBe(47_000);
    expect(pnl.nonOperatingIncome.total).toBe(500);
    expect(pnl.nonOperatingExpense.total).toBe(200);
  });

  it("Gross Profit = Operating Income − COGS", () => {
    expect(pnl.grossProfit).toBe(90_000);
  });

  it("Operating Profit = Gross Profit − Operating Expense", () => {
    expect(pnl.operatingProfit).toBe(43_000);
  });

  it("Net Profit/Loss = Operating Profit + Non Op Income − Non Op Expense", () => {
    expect(pnl.netProfitLoss).toBe(43_300);
  });
});

describe("buildProfitAndLoss — loss-making period", () => {
  it("Net Profit/Loss is negative when expenses exceed income", () => {
    const ledger: LedgerRow[] = [
      row({
        accountId: "i1",
        accountName: "Sales",
        accountType: "INCOME",
        netBalance: 10_000,
      }),
      row({
        accountId: "e1",
        accountName: "Rent",
        accountType: "EXPENSE",
        netBalance: 25_000,
      }),
    ];
    const pnl = buildProfitAndLoss(ledger);
    expect(pnl.grossProfit).toBe(10_000);
    expect(pnl.operatingProfit).toBe(-15_000);
    expect(pnl.netProfitLoss).toBe(-15_000);
  });

  it("negative Gross Profit is allowed (COGS > Operating Income)", () => {
    const ledger: LedgerRow[] = [
      row({
        accountId: "i1",
        accountName: "Sales",
        accountType: "INCOME",
        netBalance: 5_000,
      }),
      row({
        accountId: "c1",
        accountName: "COGS",
        accountType: "COST_OF_GOODS_SOLD",
        netBalance: 8_000,
      }),
    ];
    const pnl = buildProfitAndLoss(ledger);
    expect(pnl.grossProfit).toBe(-3_000);
    expect(pnl.operatingProfit).toBe(-3_000);
    expect(pnl.netProfitLoss).toBe(-3_000);
  });
});

describe("buildProfitAndLoss — sort + zero-balance handling", () => {
  it("drops accounts with netBalance === 0", () => {
    const ledger: LedgerRow[] = [
      row({
        accountId: "i1",
        accountName: "Sales",
        accountType: "INCOME",
        netBalance: 100,
      }),
      row({
        accountId: "i2",
        accountName: "Unused Income",
        accountType: "INCOME",
        netBalance: 0,
      }),
    ];
    const pnl = buildProfitAndLoss(ledger);
    expect(pnl.operatingIncome.accounts).toHaveLength(1);
    expect(pnl.operatingIncome.accounts[0].accountName).toBe("Sales");
  });

  it("sorts accounts within a section by code then name (numeric-aware)", () => {
    const ledger: LedgerRow[] = [
      row({
        accountId: "a",
        accountName: "Bravo",
        accountCode: "4100",
        accountType: "INCOME",
        netBalance: 1,
      }),
      row({
        accountId: "b",
        accountName: "Alpha",
        accountCode: "4020",
        accountType: "INCOME",
        netBalance: 1,
      }),
      row({
        accountId: "c",
        accountName: "Charlie (no code)",
        accountCode: null,
        accountType: "INCOME",
        netBalance: 1,
      }),
    ];
    const pnl = buildProfitAndLoss(ledger);
    const names = pnl.operatingIncome.accounts.map((a) => a.accountName);
    // "4020" sorts before "4100"; null code falls back to name and
    // "Charlie..." sorts last among these three.
    expect(names[0]).toBe("Alpha");
    expect(names[1]).toBe("Bravo");
    expect(names[2]).toBe("Charlie (no code)");
  });
});

describe("buildProfitAndLoss — balance-sheet types are ignored", () => {
  it("ASSET / LIABILITY / EQUITY rows don't leak into any P&L section", () => {
    const ledger: LedgerRow[] = [
      row({
        accountId: "a1",
        accountName: "Cash",
        accountType: "ASSET",
        netBalance: 50_000,
      }),
      row({
        accountId: "l1",
        accountName: "Loan",
        accountType: "LIABILITY",
        netBalance: 20_000,
      }),
      row({
        accountId: "eq1",
        accountName: "Capital",
        accountType: "EQUITY",
        netBalance: 30_000,
      }),
      row({
        accountId: "i1",
        accountName: "Sales",
        accountType: "INCOME",
        netBalance: 1_000,
      }),
    ];
    const pnl = buildProfitAndLoss(ledger);
    expect(pnl.operatingIncome.accounts).toHaveLength(1);
    expect(pnl.operatingIncome.total).toBe(1_000);
    expect(pnl.netProfitLoss).toBe(1_000);
  });
});
