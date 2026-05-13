/**
 * RPT-A — Pure helpers for aggregating JournalEntryLine rows into
 * report-friendly shapes.
 *
 * No DB calls — the caller queries the lines (with the right
 * date / org filter) and hands them in. The aggregation logic
 * is pure so it's trivially testable and reusable across multiple
 * reports (Trial Balance, P&L extension, future Balance Sheet).
 *
 * Sign convention (the standard one):
 *
 *   Debit-balance accounts:   ASSET, EXPENSE, COST_OF_GOODS_SOLD, OTHER_EXPENSE
 *     netBalance = totalDebit − totalCredit
 *
 *   Credit-balance accounts:  LIABILITY, EQUITY, INCOME, OTHER_INCOME
 *     netBalance = totalCredit − totalDebit
 *
 * `netBalance` is therefore always positive when the account
 * carries its "natural" balance; a negative value flags an unusual
 * state (e.g. negative cash, debit balance on an income account).
 */

export type AccountBucket =
  | "INCOME"
  | "OTHER_INCOME"
  | "EXPENSE"
  | "COST_OF_GOODS_SOLD"
  | "OTHER_EXPENSE"
  | "ASSET"
  | "LIABILITY"
  | "EQUITY";

const DEBIT_BALANCE_TYPES: ReadonlySet<AccountBucket> = new Set([
  "ASSET",
  "EXPENSE",
  "COST_OF_GOODS_SOLD",
  "OTHER_EXPENSE",
]);

export type LedgerLineInput = {
  account: {
    id: string;
    name: string;
    code: string | null;
    type: AccountBucket;
  };
  debit: number;
  credit: number;
};

export type LedgerRow = {
  accountId: string;
  accountName: string;
  accountCode: string | null;
  accountType: AccountBucket;
  totalDebit: number;
  totalCredit: number;
  /** Signed by accounting convention (positive = natural balance). */
  netBalance: number;
};

/** Bucket → cumulative debit + credit. */
export type BucketTotals = Record<
  AccountBucket,
  { totalDebit: number; totalCredit: number }
>;

function emptyBucketTotals(): BucketTotals {
  return {
    INCOME: { totalDebit: 0, totalCredit: 0 },
    OTHER_INCOME: { totalDebit: 0, totalCredit: 0 },
    EXPENSE: { totalDebit: 0, totalCredit: 0 },
    COST_OF_GOODS_SOLD: { totalDebit: 0, totalCredit: 0 },
    OTHER_EXPENSE: { totalDebit: 0, totalCredit: 0 },
    ASSET: { totalDebit: 0, totalCredit: 0 },
    LIABILITY: { totalDebit: 0, totalCredit: 0 },
    EQUITY: { totalDebit: 0, totalCredit: 0 },
  };
}

/**
 * Group lines by accountId, sum debits + credits, compute signed balance.
 * Drops accounts whose total debit and credit are both zero.
 *
 * The output is unsorted — callers typically sort by `accountCode` for
 * Trial Balance and by `accountType + netBalance desc` for P&L.
 */
export function aggregateLedgerLines(lines: LedgerLineInput[]): LedgerRow[] {
  const byAccount = new Map<string, LedgerRow>();
  for (const line of lines) {
    const id = line.account.id;
    let row = byAccount.get(id);
    if (!row) {
      row = {
        accountId: id,
        accountName: line.account.name,
        accountCode: line.account.code,
        accountType: line.account.type,
        totalDebit: 0,
        totalCredit: 0,
        netBalance: 0,
      };
      byAccount.set(id, row);
    }
    row.totalDebit += line.debit;
    row.totalCredit += line.credit;
  }
  for (const row of byAccount.values()) {
    const isDebitNatural = DEBIT_BALANCE_TYPES.has(row.accountType);
    row.netBalance = isDebitNatural
      ? row.totalDebit - row.totalCredit
      : row.totalCredit - row.totalDebit;
  }
  return [...byAccount.values()].filter(
    (r) => r.totalDebit !== 0 || r.totalCredit !== 0
  );
}

/**
 * Bucket totals — used by the P&L upgrade to extract "income from
 * the ledger" and "expense from the ledger" in one pass.
 */
export function sumByBucket(rows: LedgerRow[]): BucketTotals {
  const totals = emptyBucketTotals();
  for (const r of rows) {
    totals[r.accountType].totalDebit += r.totalDebit;
    totals[r.accountType].totalCredit += r.totalCredit;
  }
  return totals;
}

/**
 * Trial balance check — returns |Σ DR − Σ CR|. Zero means balanced.
 * The Trial Balance UI surfaces this so the user can spot a
 * misposted journal entry.
 */
export function trialBalanceImbalance(rows: LedgerRow[]): number {
  let dr = 0;
  let cr = 0;
  for (const r of rows) {
    dr += r.totalDebit;
    cr += r.totalCredit;
  }
  return Math.abs(dr - cr);
}
