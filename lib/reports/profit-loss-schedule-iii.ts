/**
 * REPORTS — Profit and Loss (Schedule III).
 *
 * The Companies Act 2013 Schedule III prescribes a strict 15-section
 * P&L layout for Indian companies. Unlike the P&L (which
 * groups by account type with subtotals at Gross / Operating / Net
 * profit), Schedule III uses Roman numerals and bakes in specific
 * line-items like "Cost of materials consumed", "Employee benefits
 * expense", "Finance costs", "Depreciation and amortisation",
 * "Exceptional items", "Extraordinary items", and separate tax
 * tracks for continuing vs discontinuing operations.
 *
 * Structure (matches the user-shared screenshot):
 *
 *    I. Revenue from operations
 *   II. Other Income
 *  III. Total Revenue (I + II)
 *   IV. Expenses
 *       1. Cost of materials consumed
 *       2. Purchases of stock in trade
 *       3. Changes in Inventories of finished goods…
 *       4. Employee benefits expense
 *       5. Finance Costs
 *       6. Depreciation And Amortization Expense
 *       7. Other Expenses
 *    V. Profit before exceptional and extraordinary items and tax (III − IV)
 *   VI. Exceptional Items
 *  VII. Profit before extraordinary items and tax (V − VI)
 * VIII. Extraordinary Items
 *   IX. Profit before tax (VII − VIII)
 *    X. Tax Expense
 *       1. Current tax
 *       2. Deferred tax
 *   XI. Profit (Loss) for the period from continuing operations (IX − X)
 *  XII. Profit (Loss) from discontinuing operations
 * XIII. Tax expense of discontinuing operations
 *  XIV. Profit (Loss) from Discontinuing operations (after tax) (XII − XIII)
 *   XV. Profit (Loss) for the period (XI + XIV)
 *
 * Mapping from our `ChartOfAccount` (which uses account.type +
 * account.name) to Schedule III line items uses a name-based
 * heuristic. The names below are case-insensitive matches; any
 * account that doesn't match a specific bucket falls into "Other
 * Expenses" (for EXPENSE / OTHER_EXPENSE) or "Other Income" (for
 * OTHER_INCOME). This errs toward simplicity — orgs that want a
 * pixel-perfect Schedule III mapping should later add an explicit
 * `scheduleIIIBucket` column on ChartOfAccount.
 *
 * Pure module — no DB. Caller queries journal entries, runs them
 * through `aggregateLedgerLines`, hands rows in.
 */

import type { LedgerRow } from "./ledger-aggregation";

export type ScheduleIIIBucket =
  | "revenue-from-operations"
  | "other-income"
  | "cost-of-materials-consumed"
  | "purchases-of-stock-in-trade"
  | "changes-in-inventory"
  | "employee-benefits"
  | "finance-costs"
  | "depreciation-amortization"
  | "other-expenses"
  | "exceptional-items"
  | "extraordinary-items"
  | "current-tax"
  | "deferred-tax"
  | "discontinuing-operations-revenue"
  | "discontinuing-operations-tax";

/** Map a single account to its Schedule III bucket via name heuristic. */
export function bucketForScheduleIII(input: {
  accountType: LedgerRow["accountType"];
  accountName: string;
}): ScheduleIIIBucket {
  const name = input.accountName.trim().toLowerCase();

  // Income side — straightforward.
  if (input.accountType === "INCOME") return "revenue-from-operations";
  if (input.accountType === "OTHER_INCOME") return "other-income";

  // COGS bucket — split by name hints.
  if (input.accountType === "COST_OF_GOODS_SOLD") {
    if (
      name.includes("material") &&
      (name.includes("consum") || name.includes("used"))
    ) {
      return "cost-of-materials-consumed";
    }
    if (name.includes("purchase") || name.includes("stock in trade")) {
      return "purchases-of-stock-in-trade";
    }
    if (name.includes("inventory") || name.includes("inventories")) {
      return "changes-in-inventory";
    }
    // Default COGS → cost of materials (most common case).
    return "cost-of-materials-consumed";
  }

  // Tax expense — explicit name match
  if (
    name.includes("deferred tax") ||
    (name.includes("deferred") && name.includes("tax"))
  ) {
    return "deferred-tax";
  }
  if (
    name === "current tax" ||
    name === "income tax" ||
    name === "tax expense" ||
    name === "provision for tax" ||
    (name.includes("tax") && name.includes("provision")) ||
    (name.includes("income") && name.includes("tax"))
  ) {
    return "current-tax";
  }

  // Expense side — name heuristics for the named buckets.
  if (input.accountType === "EXPENSE" || input.accountType === "OTHER_EXPENSE") {
    if (
      name.includes("salary") ||
      name.includes("salaries") ||
      name.includes("wages") ||
      name.includes("employee") ||
      name.includes("staff") ||
      name.includes("payroll") ||
      name.includes("pf ") || // provident fund
      name.includes("gratuity") ||
      name.includes("esi") || // employee state insurance
      name === "bonus"
    ) {
      return "employee-benefits";
    }
    if (
      name.includes("interest") ||
      name.includes("finance cost") ||
      name.includes("bank charge") ||
      name.includes("loan processing")
    ) {
      return "finance-costs";
    }
    if (
      name.includes("depreciation") ||
      name.includes("amortization") ||
      name.includes("amortisation")
    ) {
      return "depreciation-amortization";
    }
    if (
      name.includes("exceptional") ||
      input.accountType === "OTHER_EXPENSE"
    ) {
      // OTHER_EXPENSE default into Exceptional Items (more honest
      // than dumping into "Other Expenses" since OTHER_EXPENSE in
      // our schema usually means non-operating one-offs).
      // Accounts explicitly named "extraordinary" go to that line.
      if (name.includes("extraordinary")) return "extraordinary-items";
      return "exceptional-items";
    }
    return "other-expenses";
  }

  return "other-expenses";
}

export type ScheduleIIIAmounts = Record<ScheduleIIIBucket, number>;

/** All buckets present, each at 0. Used as the merge identity. */
export function emptyScheduleIIIAmounts(): ScheduleIIIAmounts {
  return {
    "revenue-from-operations": 0,
    "other-income": 0,
    "cost-of-materials-consumed": 0,
    "purchases-of-stock-in-trade": 0,
    "changes-in-inventory": 0,
    "employee-benefits": 0,
    "finance-costs": 0,
    "depreciation-amortization": 0,
    "other-expenses": 0,
    "exceptional-items": 0,
    "extraordinary-items": 0,
    "current-tax": 0,
    "deferred-tax": 0,
    "discontinuing-operations-revenue": 0,
    "discontinuing-operations-tax": 0,
  };
}

export type ScheduleIIIPnl = {
  /** I */ revenueFromOperations: number;
  /** II */ otherIncome: number;
  /** III = I + II */ totalRevenue: number;
  /** IV — expenses breakdown */
  expenses: {
    costOfMaterialsConsumed: number;
    purchasesOfStockInTrade: number;
    changesInInventories: number;
    employeeBenefits: number;
    financeCosts: number;
    depreciationAndAmortization: number;
    otherExpenses: number;
    /** Sum of all 7 lines above. */
    total: number;
  };
  /** V = III − IV.total */ profitBeforeExceptionalAndExtraordinary: number;
  /** VI */ exceptionalItems: number;
  /** VII = V − VI */ profitBeforeExtraordinary: number;
  /** VIII */ extraordinaryItems: number;
  /** IX = VII − VIII */ profitBeforeTax: number;
  /** X — tax expense breakdown */
  taxExpense: {
    currentTax: number;
    deferredTax: number;
    total: number;
  };
  /** XI = IX − X.total */ profitFromContinuingOperations: number;
  /** XII */ profitFromDiscontinuingOperations: number;
  /** XIII */ taxOfDiscontinuingOperations: number;
  /** XIV = XII − XIII */ profitFromDiscontinuingAfterTax: number;
  /** XV = XI + XIV */ profitForPeriod: number;
};

/**
 * Build the Schedule III P&L from aggregated ledger rows.
 *
 * Sign convention: income is recorded with positive netBalance (its
 * natural credit side), expenses with positive netBalance (their
 * natural debit side). The arithmetic below assumes both are
 * positive and just subtracts straight.
 */
export function buildScheduleIIIPnl(
  ledgerRows: LedgerRow[]
): ScheduleIIIPnl {
  const amounts = emptyScheduleIIIAmounts();
  for (const r of ledgerRows) {
    if (r.netBalance === 0) continue;
    const bucket = bucketForScheduleIII({
      accountType: r.accountType,
      accountName: r.accountName,
    });
    amounts[bucket] += r.netBalance;
  }

  const totalExpenses =
    amounts["cost-of-materials-consumed"] +
    amounts["purchases-of-stock-in-trade"] +
    amounts["changes-in-inventory"] +
    amounts["employee-benefits"] +
    amounts["finance-costs"] +
    amounts["depreciation-amortization"] +
    amounts["other-expenses"];

  const totalRevenue =
    amounts["revenue-from-operations"] + amounts["other-income"];
  const profitBeforeExceptionalAndExtraordinary =
    totalRevenue - totalExpenses;
  const profitBeforeExtraordinary =
    profitBeforeExceptionalAndExtraordinary - amounts["exceptional-items"];
  const profitBeforeTax =
    profitBeforeExtraordinary - amounts["extraordinary-items"];
  const totalTax = amounts["current-tax"] + amounts["deferred-tax"];
  const profitFromContinuingOperations = profitBeforeTax - totalTax;
  const profitFromDiscontinuingAfterTax =
    amounts["discontinuing-operations-revenue"] -
    amounts["discontinuing-operations-tax"];
  const profitForPeriod =
    profitFromContinuingOperations + profitFromDiscontinuingAfterTax;

  return {
    revenueFromOperations: amounts["revenue-from-operations"],
    otherIncome: amounts["other-income"],
    totalRevenue,
    expenses: {
      costOfMaterialsConsumed: amounts["cost-of-materials-consumed"],
      purchasesOfStockInTrade: amounts["purchases-of-stock-in-trade"],
      changesInInventories: amounts["changes-in-inventory"],
      employeeBenefits: amounts["employee-benefits"],
      financeCosts: amounts["finance-costs"],
      depreciationAndAmortization: amounts["depreciation-amortization"],
      otherExpenses: amounts["other-expenses"],
      total: totalExpenses,
    },
    profitBeforeExceptionalAndExtraordinary,
    exceptionalItems: amounts["exceptional-items"],
    profitBeforeExtraordinary,
    extraordinaryItems: amounts["extraordinary-items"],
    profitBeforeTax,
    taxExpense: {
      currentTax: amounts["current-tax"],
      deferredTax: amounts["deferred-tax"],
      total: totalTax,
    },
    profitFromContinuingOperations,
    profitFromDiscontinuingOperations:
      amounts["discontinuing-operations-revenue"],
    taxOfDiscontinuingOperations: amounts["discontinuing-operations-tax"],
    profitFromDiscontinuingAfterTax,
    profitForPeriod,
  };
}
