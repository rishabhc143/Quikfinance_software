import { describe, it, expect } from "vitest";
import {
  buildTrialBalance,
  GROUP_ORDER,
} from "@/lib/reports/trial-balance";
import {
  aggregateLedgerLines,
  type LedgerLineInput,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";

/**
 * RPT-TB tests — group rollup + sign logic + sort stability.
 *
 * Each test feeds raw LedgerLineInput rows through aggregateLedgerLines
 * so we exercise the full pipeline (lib + helper) the page uses.
 */

function line(
  accountId: string,
  type: AccountBucket,
  debit: number,
  credit: number,
  code: string | null = null,
  name?: string
): LedgerLineInput {
  return {
    account: {
      id: accountId,
      name: name ?? `Account ${accountId}`,
      code,
      type,
    },
    debit,
    credit,
  };
}

describe("lib/reports/trial-balance", () => {
  it("empty input returns empty groups and zero totals", () => {
    const rows = aggregateLedgerLines([]);
    const tb = buildTrialBalance(rows);
    expect(tb.groups).toEqual([]);
    expect(tb.totalDebit).toBe(0);
    expect(tb.totalCredit).toBe(0);
    expect(tb.imbalance).toBe(0);
  });

  it("ASSET with debit 1000 lands in Assets group with netDebit=1000", () => {
    const rows = aggregateLedgerLines([line("a1", "ASSET", 1000, 0)]);
    const tb = buildTrialBalance(rows);
    expect(tb.groups).toHaveLength(1);
    expect(tb.groups[0].groupKey).toBe("ASSET");
    expect(tb.groups[0].groupLabel).toBe("Assets");
    expect(tb.groups[0].rows).toHaveLength(1);
    expect(tb.groups[0].rows[0].netDebit).toBe(1000);
    expect(tb.groups[0].rows[0].netCredit).toBe(0);
    expect(tb.totalDebit).toBe(1000);
    expect(tb.totalCredit).toBe(0);
  });

  it("INCOME with credit 5000 lands in Income group with netCredit=5000", () => {
    const rows = aggregateLedgerLines([line("i1", "INCOME", 0, 5000)]);
    const tb = buildTrialBalance(rows);
    expect(tb.groups).toHaveLength(1);
    expect(tb.groups[0].groupKey).toBe("INCOME");
    expect(tb.groups[0].rows[0].netCredit).toBe(5000);
    expect(tb.groups[0].rows[0].netDebit).toBe(0);
  });

  it("OTHER_INCOME rolls up into the Income group (5-group rollup)", () => {
    const rows = aggregateLedgerLines([
      line("i1", "INCOME", 0, 1000),
      line("oi1", "OTHER_INCOME", 0, 500),
    ]);
    const tb = buildTrialBalance(rows);
    expect(tb.groups).toHaveLength(1);
    expect(tb.groups[0].groupKey).toBe("INCOME");
    expect(tb.groups[0].rows).toHaveLength(2);
    expect(tb.groups[0].subtotalCredit).toBe(1500);
  });

  it("COST_OF_GOODS_SOLD + EXPENSE + OTHER_EXPENSE roll into Expense group", () => {
    const rows = aggregateLedgerLines([
      line("e1", "EXPENSE", 200, 0),
      line("c1", "COST_OF_GOODS_SOLD", 300, 0),
      line("oe1", "OTHER_EXPENSE", 100, 0),
    ]);
    const tb = buildTrialBalance(rows);
    expect(tb.groups).toHaveLength(1);
    expect(tb.groups[0].groupKey).toBe("EXPENSE");
    expect(tb.groups[0].rows).toHaveLength(3);
    expect(tb.groups[0].subtotalDebit).toBe(600);
  });

  it("balanced ledger (debit == credit) has imbalance = 0", () => {
    // Cash 10,000 / Sales 10,000 — classic Trial Balance pair
    const rows = aggregateLedgerLines([
      line("cash", "ASSET", 10_000, 0),
      line("sales", "INCOME", 0, 10_000),
    ]);
    const tb = buildTrialBalance(rows);
    expect(tb.totalDebit).toBe(10_000);
    expect(tb.totalCredit).toBe(10_000);
    expect(tb.imbalance).toBe(0);
  });

  it("unbalanced ledger surfaces non-zero imbalance", () => {
    const rows = aggregateLedgerLines([
      line("cash", "ASSET", 10_000, 0),
      line("sales", "INCOME", 0, 8_000),
    ]);
    const tb = buildTrialBalance(rows);
    expect(tb.imbalance).toBe(2_000);
  });

  it("groups render in canonical order: Assets, Liabilities, Equities, Income, Expense", () => {
    // Feed in REVERSE order to verify sort isn't input-dependent.
    const rows = aggregateLedgerLines([
      line("e1", "EXPENSE", 100, 0),
      line("i1", "INCOME", 0, 100),
      line("eq1", "EQUITY", 0, 100),
      line("li1", "LIABILITY", 0, 100),
      line("a1", "ASSET", 100, 0),
    ]);
    const tb = buildTrialBalance(rows);
    expect(tb.groups.map((g) => g.groupKey)).toEqual([
      "ASSET",
      "LIABILITY",
      "EQUITY",
      "INCOME",
      "EXPENSE",
    ]);
  });

  it("GROUP_ORDER export matches the canonical 5-group sequence", () => {
    expect(GROUP_ORDER).toEqual([
      "ASSET",
      "LIABILITY",
      "EQUITY",
      "INCOME",
      "EXPENSE",
    ]);
  });

  it("accounts with code 100 sort before 1000 (numeric-aware)", () => {
    const rows = aggregateLedgerLines([
      line("a2", "ASSET", 5, 0, "1000", "Bank"),
      line("a1", "ASSET", 7, 0, "100", "Cash"),
      line("a3", "ASSET", 9, 0, "1100", "Card"),
    ]);
    const tb = buildTrialBalance(rows);
    const codes = tb.groups[0].rows.map((r) => r.accountCode);
    expect(codes).toEqual(["100", "1000", "1100"]);
  });

  it("accounts where debits exactly equal credits are excluded", () => {
    // Account with both debit + credit 500 → signedNet=0 → no Trial
    // Balance row (this matches accounting convention).
    const rows = aggregateLedgerLines([line("a1", "ASSET", 500, 500)]);
    const tb = buildTrialBalance(rows);
    expect(tb.groups).toEqual([]);
  });

  it("ASSET account with credit > debit lands in Net Credit column (unusual but valid)", () => {
    // A negative cash balance, e.g. an overdraft on the books.
    const rows = aggregateLedgerLines([line("cash", "ASSET", 100, 250)]);
    const tb = buildTrialBalance(rows);
    expect(tb.groups[0].rows[0].netDebit).toBe(0);
    expect(tb.groups[0].rows[0].netCredit).toBe(150);
  });

  it("subtotal per group equals sum of its row's netDebit/netCredit", () => {
    const rows = aggregateLedgerLines([
      line("a1", "ASSET", 1000, 0),
      line("a2", "ASSET", 2000, 0),
      line("a3", "ASSET", 500, 0),
    ]);
    const tb = buildTrialBalance(rows);
    expect(tb.groups[0].subtotalDebit).toBe(3500);
    expect(tb.groups[0].subtotalCredit).toBe(0);
  });

  it("groupLabel matches Zoho convention (Assets/Liabilities/Equities/Income/Expense)", () => {
    const rows = aggregateLedgerLines([
      line("a", "ASSET", 1, 0),
      line("l", "LIABILITY", 0, 1),
      line("e", "EQUITY", 0, 1),
      line("i", "INCOME", 0, 1),
      line("x", "EXPENSE", 1, 0),
    ]);
    const tb = buildTrialBalance(rows);
    expect(tb.groups.map((g) => g.groupLabel)).toEqual([
      "Assets",
      "Liabilities",
      "Equities",
      "Income",
      "Expense",
    ]);
  });
});
