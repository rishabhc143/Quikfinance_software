/**
 * REPORTS — Pure builder that turns aggregated ledger rows into the
 * Zoho-style Profit and Loss structure:
 *
 *   Operating Income           (INCOME accounts)
 *   Cost of Goods Sold         (COST_OF_GOODS_SOLD accounts)
 *   Gross Profit               (Operating Income − COGS)
 *   Operating Expense          (EXPENSE accounts)
 *   Operating Profit           (Gross Profit − Operating Expense)
 *   Non Operating Income       (OTHER_INCOME accounts)
 *   Non Operating Expense      (OTHER_EXPENSE accounts)
 *   Net Profit/Loss            (Operating Profit + Non Op Income − Non Op Expense)
 *
 * No DB calls — the caller queries the lines, runs them through
 * `aggregateLedgerLines`, and hands the rows in. This file is pure
 * + Vitest-friendly.
 *
 * Sign convention (matches `ledger-aggregation.ts`):
 *   - Income / Other Income → `netBalance` is positive when the
 *     account has its natural credit balance.
 *   - Expense / COGS / Other Expense → `netBalance` is positive when
 *     the account has its natural debit balance.
 *   So every section's `total` is positive in the normal case and
 *   the subtotal formulas use plain subtraction.
 */

import type { LedgerRow } from "./ledger-aggregation";

export type PnlAccountRow = {
  accountId: string;
  accountName: string;
  accountCode: string | null;
  /** Signed positive when the account has its natural balance. */
  amount: number;
};

export type PnlSection = {
  label: string;
  accounts: PnlAccountRow[];
  total: number;
};

export type ProfitAndLoss = {
  operatingIncome: PnlSection;
  costOfGoodsSold: PnlSection;
  /** Operating Income − COGS. Can be negative (rare). */
  grossProfit: number;
  operatingExpense: PnlSection;
  /** Gross Profit − Operating Expense. Can be negative. */
  operatingProfit: number;
  nonOperatingIncome: PnlSection;
  nonOperatingExpense: PnlSection;
  /** Operating Profit + Non Op Income − Non Op Expense. */
  netProfitLoss: number;
};

const SECTION_TYPES = {
  operatingIncome: "INCOME",
  costOfGoodsSold: "COST_OF_GOODS_SOLD",
  operatingExpense: "EXPENSE",
  nonOperatingIncome: "OTHER_INCOME",
  nonOperatingExpense: "OTHER_EXPENSE",
} as const;

const SECTION_LABELS: Record<keyof typeof SECTION_TYPES, string> = {
  operatingIncome: "Operating Income",
  costOfGoodsSold: "Cost of Goods Sold",
  operatingExpense: "Operating Expense",
  nonOperatingIncome: "Non Operating Income",
  nonOperatingExpense: "Non Operating Expense",
};

/**
 * Build a Zoho-style Profit and Loss from aggregated ledger rows.
 *
 * Accounts with `netBalance === 0` are dropped from their section's
 * `accounts` list (matches Zoho's behaviour — empty sections still
 * show a "Total for X: 0.00" row from the section header). Within a
 * section, accounts sort by code then name.
 */
export function buildProfitAndLoss(ledgerRows: LedgerRow[]): ProfitAndLoss {
  function section(key: keyof typeof SECTION_TYPES): PnlSection {
    const type = SECTION_TYPES[key];
    const accounts: PnlAccountRow[] = [];
    for (const r of ledgerRows) {
      if (r.accountType !== type) continue;
      if (r.netBalance === 0) continue;
      accounts.push({
        accountId: r.accountId,
        accountName: r.accountName,
        accountCode: r.accountCode,
        amount: r.netBalance,
      });
    }
    accounts.sort((a, b) =>
      (a.accountCode ?? a.accountName).localeCompare(
        b.accountCode ?? b.accountName,
        undefined,
        { numeric: true }
      )
    );
    const total = accounts.reduce((s, a) => s + a.amount, 0);
    return { label: SECTION_LABELS[key], accounts, total };
  }

  const operatingIncome = section("operatingIncome");
  const costOfGoodsSold = section("costOfGoodsSold");
  const grossProfit = operatingIncome.total - costOfGoodsSold.total;
  const operatingExpense = section("operatingExpense");
  const operatingProfit = grossProfit - operatingExpense.total;
  const nonOperatingIncome = section("nonOperatingIncome");
  const nonOperatingExpense = section("nonOperatingExpense");
  const netProfitLoss =
    operatingProfit + nonOperatingIncome.total - nonOperatingExpense.total;

  return {
    operatingIncome,
    costOfGoodsSold,
    grossProfit,
    operatingExpense,
    operatingProfit,
    nonOperatingIncome,
    nonOperatingExpense,
    netProfitLoss,
  };
}
