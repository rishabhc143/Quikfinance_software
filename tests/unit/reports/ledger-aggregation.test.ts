import { describe, it, expect } from "vitest";
import {
  aggregateLedgerLines,
  sumByBucket,
  trialBalanceImbalance,
  type LedgerLineInput,
} from "@/lib/reports/ledger-aggregation";

/**
 * Tests for RPT-A ledger aggregation helpers.
 *
 * Pure functions: no DB. The caller (Trial Balance page, P&L upgrade)
 * queries JournalEntryLine rows and hands them in.
 */

const acct = (
  id: string,
  type:
    | "ASSET"
    | "LIABILITY"
    | "EQUITY"
    | "INCOME"
    | "OTHER_INCOME"
    | "EXPENSE"
    | "COST_OF_GOODS_SOLD"
    | "OTHER_EXPENSE",
  name = `Account ${id}`,
  code: string | null = null
) => ({ id, name, code, type });

const line = (
  account: { id: string; name: string; code: string | null; type: LedgerLineInput["account"]["type"] },
  debit: number,
  credit: number
): LedgerLineInput => ({ account, debit, credit });

describe("aggregateLedgerLines — empty / single", () => {
  it("returns [] for empty input", () => {
    expect(aggregateLedgerLines([])).toEqual([]);
  });

  it("returns one row when given one line", () => {
    const a = acct("cash", "ASSET", "Cash", "1000");
    const rows = aggregateLedgerLines([line(a, 100, 0)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accountId: "cash",
      accountName: "Cash",
      accountCode: "1000",
      accountType: "ASSET",
      totalDebit: 100,
      totalCredit: 0,
      netBalance: 100,
    });
  });

  it("drops accounts where both DR and CR are zero", () => {
    const a = acct("zero", "ASSET");
    const rows = aggregateLedgerLines([line(a, 0, 0)]);
    expect(rows).toEqual([]);
  });
});

describe("aggregateLedgerLines — multiple lines per account", () => {
  it("sums debits + credits per accountId", () => {
    const a = acct("cash", "ASSET");
    const rows = aggregateLedgerLines([
      line(a, 100, 0),
      line(a, 200, 0),
      line(a, 0, 50),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].totalDebit).toBe(300);
    expect(rows[0].totalCredit).toBe(50);
    expect(rows[0].netBalance).toBe(250); // 300 - 50 (asset = DR-natural)
  });

  it("does not mix two accounts of the same type", () => {
    const a = acct("cash", "ASSET");
    const b = acct("ar", "ASSET");
    const rows = aggregateLedgerLines([line(a, 100, 0), line(b, 50, 0)]);
    expect(rows).toHaveLength(2);
  });
});

describe("aggregateLedgerLines — sign convention", () => {
  it("ASSET / EXPENSE / COGS / OTHER_EXPENSE: netBalance = DR − CR", () => {
    for (const type of ["ASSET", "EXPENSE", "COST_OF_GOODS_SOLD", "OTHER_EXPENSE"] as const) {
      const a = acct(`a-${type}`, type);
      const rows = aggregateLedgerLines([line(a, 800, 200)]);
      expect(rows[0].netBalance).toBe(600);
    }
  });

  it("LIABILITY / EQUITY / INCOME / OTHER_INCOME: netBalance = CR − DR", () => {
    for (const type of ["LIABILITY", "EQUITY", "INCOME", "OTHER_INCOME"] as const) {
      const a = acct(`a-${type}`, type);
      const rows = aggregateLedgerLines([line(a, 200, 800)]);
      expect(rows[0].netBalance).toBe(600);
    }
  });

  it("negative netBalance flags an unusual state (e.g. negative cash)", () => {
    const a = acct("overdraft", "ASSET");
    const rows = aggregateLedgerLines([line(a, 100, 500)]);
    expect(rows[0].netBalance).toBe(-400);
  });
});

describe("sumByBucket", () => {
  it("groups totals by accountType bucket", () => {
    const cash = acct("cash", "ASSET");
    const sales = acct("sales", "INCOME");
    const aws = acct("aws", "EXPENSE");
    const rows = aggregateLedgerLines([
      line(cash, 1000, 0),
      line(sales, 0, 1000),
      line(aws, 200, 0),
    ]);
    const buckets = sumByBucket(rows);
    expect(buckets.ASSET).toEqual({ totalDebit: 1000, totalCredit: 0 });
    expect(buckets.INCOME).toEqual({ totalDebit: 0, totalCredit: 1000 });
    expect(buckets.EXPENSE).toEqual({ totalDebit: 200, totalCredit: 0 });
    expect(buckets.LIABILITY).toEqual({ totalDebit: 0, totalCredit: 0 });
  });
});

describe("trialBalanceImbalance", () => {
  it("returns 0 for a balanced ledger", () => {
    const cash = acct("cash", "ASSET");
    const sales = acct("sales", "INCOME");
    const rows = aggregateLedgerLines([line(cash, 1000, 0), line(sales, 0, 1000)]);
    expect(trialBalanceImbalance(rows)).toBe(0);
  });

  it("returns the gap when DR ≠ CR", () => {
    const cash = acct("cash", "ASSET");
    const rows = aggregateLedgerLines([line(cash, 1000, 0)]);
    // 1000 DR, 0 CR → imbalance 1000
    expect(trialBalanceImbalance(rows)).toBe(1000);
  });

  it("absolute value — imbalance always non-negative", () => {
    const cash = acct("cash", "ASSET");
    const rows = aggregateLedgerLines([line(cash, 0, 1000)]);
    expect(trialBalanceImbalance(rows)).toBe(1000);
  });
});
