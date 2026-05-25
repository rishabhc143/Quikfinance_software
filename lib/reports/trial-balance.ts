/**
 * RPT-TB — Trial Balance compute helper.
 *
 * Takes the raw aggregated ledger rows (from `aggregateLedgerLines`)
 * and produces a Zoho-parity 5-group view: Assets / Liabilities /
 * Equities / Income / Expense. Each account row shows its net
 * position on a SINGLE side (debit OR credit) — accounting
 * convention.
 *
 * Group rollups:
 *   ASSET                                                    → Assets
 *   LIABILITY                                                → Liabilities
 *   EQUITY                                                   → Equities
 *   INCOME + OTHER_INCOME                                    → Income
 *   EXPENSE + COST_OF_GOODS_SOLD + OTHER_EXPENSE             → Expense
 *
 * Sign:
 *   - For each account, compute `signedNet = totalDebit - totalCredit`.
 *   - If `signedNet > 0` → goes in the Net Debit column.
 *   - If `signedNet < 0` → goes in the Net Credit column (absolute value).
 *   - Accounts where debits exactly equal credits (rare but possible)
 *     are filtered out.
 *
 * The grand-total Σ Net Debit should equal Σ Net Credit when the
 * underlying journal is balanced (debits = credits). The imbalance
 * surfaces unposted records.
 *
 * Pure function — no DB calls. Caller queries the ledger + chart of
 * accounts and hands them in.
 */

import type { LedgerRow, AccountBucket } from "./ledger-aggregation";

export type TrialBalanceGroupKey =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "INCOME"
  | "EXPENSE";

export type TrialBalanceRow = {
  accountId: string;
  accountCode: string | null;
  accountName: string;
  accountType: AccountBucket;
  groupKey: TrialBalanceGroupKey;
  groupLabel: string;
  /** Positive when the account sits on the debit side; 0 otherwise. */
  netDebit: number;
  /** Positive when the account sits on the credit side; 0 otherwise. */
  netCredit: number;
};

export type TrialBalanceGroup = {
  groupKey: TrialBalanceGroupKey;
  groupLabel: string;
  rows: TrialBalanceRow[];
  subtotalDebit: number;
  subtotalCredit: number;
};

export type TrialBalance = {
  groups: TrialBalanceGroup[];
  totalDebit: number;
  totalCredit: number;
  /** |totalDebit - totalCredit|. Zero (within rounding) means balanced. */
  imbalance: number;
};

/** Canonical Zoho display order. */
export const GROUP_ORDER: readonly TrialBalanceGroupKey[] = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "INCOME",
  "EXPENSE",
] as const;

const GROUP_LABEL: Record<TrialBalanceGroupKey, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equities",
  INCOME: "Income",
  EXPENSE: "Expense",
};

/** Roll the 8 AccountBucket enum values into the 5 Zoho display groups. */
function groupKeyFor(type: AccountBucket): TrialBalanceGroupKey {
  switch (type) {
    case "ASSET":
      return "ASSET";
    case "LIABILITY":
      return "LIABILITY";
    case "EQUITY":
      return "EQUITY";
    case "INCOME":
    case "OTHER_INCOME":
      return "INCOME";
    case "EXPENSE":
    case "COST_OF_GOODS_SOLD":
    case "OTHER_EXPENSE":
      return "EXPENSE";
  }
}

/**
 * Numeric-aware accountCode sorter so "100" comes before "1000".
 * Falls back to localeCompare for non-numeric codes.
 */
function compareAccountCode(a: string | null, b: string | null): number {
  const ca = a ?? "";
  const cb = b ?? "";
  if (ca === cb) return 0;
  return ca.localeCompare(cb, undefined, { numeric: true });
}

/**
 * Build the grouped Trial Balance from aggregated ledger rows.
 *
 * Input ordering is irrelevant; output is sorted by group order
 * (Assets first) then by accountCode (numeric-aware) then by
 * accountName.
 */
export function buildTrialBalance(rows: LedgerRow[]): TrialBalance {
  // Per-group accumulator. Created lazily so empty groups don't pad
  // the output unnecessarily.
  const byGroup = new Map<TrialBalanceGroupKey, TrialBalanceGroup>();

  let totalDebit = 0;
  let totalCredit = 0;

  for (const r of rows) {
    const signedNet = r.totalDebit - r.totalCredit;

    let netDebit = 0;
    let netCredit = 0;
    if (signedNet > 0) {
      netDebit = signedNet;
    } else if (signedNet < 0) {
      netCredit = -signedNet;
    } else {
      // Exactly balanced individual account (debits == credits) —
      // produces no row in the Trial Balance.
      continue;
    }

    const groupKey = groupKeyFor(r.accountType);
    let group = byGroup.get(groupKey);
    if (!group) {
      group = {
        groupKey,
        groupLabel: GROUP_LABEL[groupKey],
        rows: [],
        subtotalDebit: 0,
        subtotalCredit: 0,
      };
      byGroup.set(groupKey, group);
    }

    group.rows.push({
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountType: r.accountType,
      groupKey,
      groupLabel: GROUP_LABEL[groupKey],
      netDebit,
      netCredit,
    });
    group.subtotalDebit += netDebit;
    group.subtotalCredit += netCredit;
    totalDebit += netDebit;
    totalCredit += netCredit;
  }

  // Sort within each group by code (numeric-aware) then name.
  for (const group of byGroup.values()) {
    group.rows.sort((a, b) => {
      const c = compareAccountCode(a.accountCode, b.accountCode);
      if (c !== 0) return c;
      return a.accountName.localeCompare(b.accountName);
    });
  }

  // Emit ALL 5 groups in canonical order, even when a group has no
  // activity. Matches Zoho's Trial Balance layout where empty groups
  // still show as section headers (rather than the page rendering a
  // "no data" empty state). The 5-group invariant means the page +
  // PDF + XLSX + CSV all render a stable shape regardless of input.
  const groups: TrialBalanceGroup[] = GROUP_ORDER.map((k) => {
    const existing = byGroup.get(k);
    if (existing) return existing;
    return {
      groupKey: k,
      groupLabel: GROUP_LABEL[k],
      rows: [],
      subtotalDebit: 0,
      subtotalCredit: 0,
    };
  });

  return {
    groups,
    totalDebit,
    totalCredit,
    imbalance: Math.abs(totalDebit - totalCredit),
  };
}

/** Get the display label for a group key (useful when rendering an
 *  empty placeholder row). */
export function groupLabelFor(key: TrialBalanceGroupKey): string {
  return GROUP_LABEL[key];
}
