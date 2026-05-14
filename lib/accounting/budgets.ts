import type { AccountType } from "@prisma/client";

/**
 * ACCT-D — Pure helpers for Budgets.
 *
 *   - `monthlyBucketsForYear` slices a fiscal year into 12 month
 *     buckets honoring the org's `fiscalYearStart` (1 = January …
 *     4 = April for the Indian FY default).
 *   - `distributeAnnualEvenly` splits an annual figure into 12
 *     monthly amounts; the last bucket absorbs the rounding
 *     remainder so Σ buckets === annual.
 *   - `isCreditNaturalAccount` picks the sign convention for
 *     "actuals" — income / other_income grow on a credit, all
 *     other CoA types grow on a debit.
 *   - `computeVariance` returns the absolute + percentage delta
 *     between the budget and actual figure (pct = null when the
 *     budget is zero, since the ratio is undefined).
 *
 * No Prisma imports beyond the AccountType enum — safe for Vitest.
 * Server-only actuals aggregation lives in actions.ts because it
 * touches the live DB.
 */

/** Last day of a month, UTC-safe. */
function endOfMonthUtc(year: number, monthIndex0: number): Date {
  // Day 0 of the next month rolls back to the last day of THIS month.
  return new Date(Date.UTC(year, monthIndex0 + 1, 0));
}

/**
 * Slice the fiscal year into 12 monthly {start, end} buckets.
 *
 * @param fiscalYear the year number the budget was created for
 *                   (e.g. 2026)
 * @param fiscalYearStartMonth 1-indexed start month from the org
 *                             (1 = January, 4 = April, …)
 *
 * Example: fiscalYear=2026, fiscalYearStartMonth=4 →
 *   bucket[0]  = 2026-04-01 .. 2026-04-30
 *   bucket[1]  = 2026-05-01 .. 2026-05-31
 *   …
 *   bucket[11] = 2027-03-01 .. 2027-03-31
 */
export function monthlyBucketsForYear(
  fiscalYear: number,
  fiscalYearStartMonth: number
): Array<{ start: Date; end: Date }> {
  if (
    !Number.isInteger(fiscalYearStartMonth) ||
    fiscalYearStartMonth < 1 ||
    fiscalYearStartMonth > 12
  ) {
    throw new Error(
      `monthlyBucketsForYear: fiscalYearStartMonth must be 1..12, got ${fiscalYearStartMonth}`
    );
  }
  const out: Array<{ start: Date; end: Date }> = [];
  for (let i = 0; i < 12; i++) {
    // 0-indexed month offset within the FY.
    const monthAbs = fiscalYearStartMonth - 1 + i;
    const yearOffset = Math.floor(monthAbs / 12);
    const monthIndex0 = monthAbs % 12;
    const year = fiscalYear + yearOffset;
    const start = new Date(Date.UTC(year, monthIndex0, 1));
    const end = endOfMonthUtc(year, monthIndex0);
    out.push({ start, end });
  }
  return out;
}

/**
 * Distribute an annual figure across 12 buckets so Σ === annual.
 *
 * Strategy: floor each cell at cents precision (4-decimal Decimal
 * column), put the rounding remainder on the LAST month. This means
 * a budget of ₹120,000 → 12 × ₹10,000 exactly; ₹100,000 → 11 × ₹8,333.33
 * + 1 × ₹8,333.37.
 */
export function distributeAnnualEvenly(annual: number): number[] {
  if (!Number.isFinite(annual)) {
    throw new Error("distributeAnnualEvenly: annual must be finite");
  }
  // Operate in integer paisa (4 decimal places) to avoid float drift.
  const scale = 10_000;
  const totalPaisa = Math.round(annual * scale);
  const perMonth = Math.floor(totalPaisa / 12);
  const remainder = totalPaisa - perMonth * 12;
  const out: number[] = [];
  for (let i = 0; i < 12; i++) {
    const cellPaisa = perMonth + (i === 11 ? remainder : 0);
    out.push(cellPaisa / scale);
  }
  return out;
}

/**
 * Whether the natural-growth side of this account type is the
 * credit column. Drives the "actuals" sign convention on the
 * Budget vs Actuals page.
 *
 *   INCOME, OTHER_INCOME  → credit-natural (actuals = Σ credit − Σ debit)
 *   EXPENSE, OTHER_EXPENSE, COST_OF_GOODS_SOLD,
 *   ASSET, LIABILITY, EQUITY → debit-natural (actuals = Σ debit − Σ credit)
 *
 * Budgets in v1 only target P&L accounts (form filter), but we
 * include the balance-sheet branches so a future ACCT-D.2 can
 * lift the filter without revisiting the math.
 */
export function isCreditNaturalAccount(type: AccountType): boolean {
  return type === "INCOME" || type === "OTHER_INCOME";
}

export type Variance = {
  /** actual − budget (positive = over budget for expenses, under for income — caller decides colour). */
  variance: number;
  /** (variance / budget) × 100, or null when budget === 0. */
  pct: number | null;
};

export function computeVariance(budget: number, actual: number): Variance {
  const variance = actual - budget;
  const pct = budget === 0 ? null : (variance / budget) * 100;
  return { variance, pct };
}

/**
 * Subset of CoA types the Budgets UI accepts. The Zoho-parity New
 * Budget form (ACCT-D.2) groups them into:
 *   - Income Accounts        — INCOME, OTHER_INCOME
 *   - Expense Accounts       — EXPENSE, OTHER_EXPENSE, COST_OF_GOODS_SOLD
 *   - (opt-in) Asset/Liability/Equity — ASSET, LIABILITY, EQUITY
 *
 * Lifted as a const so the form filter + action validator agree.
 */
export const BUDGETABLE_ACCOUNT_TYPES: readonly AccountType[] = [
  "INCOME",
  "OTHER_INCOME",
  "EXPENSE",
  "OTHER_EXPENSE",
  "COST_OF_GOODS_SOLD",
  "ASSET",
  "LIABILITY",
  "EQUITY",
] as const;

/**
 * ACCT-D.2 — Budget Period granularity, persisted on Budget.budgetPeriod.
 *   MONTHLY   → 12 BudgetLine rows per account
 *   QUARTERLY →  4 BudgetLine rows per account
 *   YEARLY    →  1 BudgetLine row per account
 */
export type BudgetPeriod = "MONTHLY" | "QUARTERLY" | "YEARLY";

const ALL_BUDGET_PERIODS: readonly BudgetPeriod[] = [
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
] as const;

export function isBudgetPeriod(s: string): s is BudgetPeriod {
  return (ALL_BUDGET_PERIODS as readonly string[]).includes(s);
}

/** Number of buckets a given period produces per account. */
export function bucketsCountForPeriod(p: BudgetPeriod): number {
  return p === "MONTHLY" ? 12 : p === "QUARTERLY" ? 4 : 1;
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Slice a fiscal year into period buckets — variable count.
 *
 * Each entry is `{ start, end, label }` where `label` is the
 * compact display string used by the editable grid column header
 * (e.g. "Apr 26", "Q1", "FY26-27").
 *
 * - MONTHLY   → 12 buckets, label like "Apr 26"
 * - QUARTERLY → 4 buckets aligned to the FY (Q1 = months 1-3, …),
 *               label "Q1" / "Q2" / "Q3" / "Q4"
 * - YEARLY    → 1 bucket spanning the full FY, label "FY26-27" (or
 *               "FY26" for calendar-year orgs)
 */
export function bucketsForFiscalYear(
  fiscalYear: number,
  fiscalYearStartMonth: number,
  period: BudgetPeriod
): Array<{ start: Date; end: Date; label: string }> {
  const monthly = monthlyBucketsForYear(fiscalYear, fiscalYearStartMonth);
  if (period === "MONTHLY") {
    return monthly.map((b) => {
      const m = b.start.getUTCMonth();
      const y = b.start.getUTCFullYear();
      return { ...b, label: `${MONTH_ABBR[m]} ${String(y).slice(-2)}` };
    });
  }
  if (period === "QUARTERLY") {
    const out: Array<{ start: Date; end: Date; label: string }> = [];
    for (let q = 0; q < 4; q++) {
      const start = monthly[q * 3].start;
      const end = monthly[q * 3 + 2].end;
      out.push({ start, end, label: `Q${q + 1}` });
    }
    return out;
  }
  // YEARLY — one bucket covering the entire FY.
  return [
    {
      start: monthly[0].start,
      end: monthly[11].end,
      label: fiscalYearLabel(fiscalYear, fiscalYearStartMonth, "short"),
    },
  ];
}

/**
 * Human-readable label for a fiscal year, e.g.
 *   "Apr 2026 - Mar 2027"     (full, default)
 *   "FY26-27"                  (short, for calendar-year orgs: "FY26")
 *
 * Used by the New Budget form's Fiscal Year dropdown and by the
 * detail-page header.
 */
export function fiscalYearLabel(
  fiscalYear: number,
  fiscalYearStartMonth: number,
  mode: "full" | "short" = "full"
): string {
  if (
    !Number.isInteger(fiscalYearStartMonth) ||
    fiscalYearStartMonth < 1 ||
    fiscalYearStartMonth > 12
  ) {
    throw new Error(
      `fiscalYearLabel: fiscalYearStartMonth must be 1..12, got ${fiscalYearStartMonth}`
    );
  }
  const startMonthName = MONTH_ABBR[fiscalYearStartMonth - 1];
  // Calendar-year FY (Jan start): one year covers the FY entirely.
  if (fiscalYearStartMonth === 1) {
    if (mode === "short") return `FY${String(fiscalYear).slice(-2)}`;
    return `${startMonthName} ${fiscalYear} - Dec ${fiscalYear}`;
  }
  // Non-calendar FY: spans two calendar years.
  const endMonthIdx0 = (fiscalYearStartMonth - 1 + 11) % 12;
  const endMonthName = MONTH_ABBR[endMonthIdx0];
  const endYear = fiscalYear + 1;
  if (mode === "short") {
    return `FY${String(fiscalYear).slice(-2)}-${String(endYear).slice(-2)}`;
  }
  return `${startMonthName} ${fiscalYear} - ${endMonthName} ${endYear}`;
}
