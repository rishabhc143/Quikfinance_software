/**
 * REPORTS — Custom Report wizard, Step 2 ("Customize Rows and Columns").
 *
 * Builds the *structural* node list shown in the wizard's Customize
 * Table view — sections (grouped from the org's Chart of Accounts by
 * AccountType) interleaved with the report's formula subtotal rows.
 * This describes which rows appear, NOT their amounts, so it needs no
 * ledger aggregation — just the account list + the report's section map.
 *
 * Phase 2 supports the Profit & Loss family. The AccountType → section
 * mapping mirrors `lib/reports/profit-loss.ts` (SECTION_TYPES /
 * SECTION_LABELS) so the wizard's structure matches the real report.
 * Other report keys return `null` (the wizard shows a "coming soon"
 * message for those until each gets its own structure).
 */

export type CustomReportSectionNode =
  | {
      kind: "section";
      key: string;
      label: string;
      accounts: { id: string; name: string }[];
    }
  | { kind: "formula"; label: string };

export type AccountForStructure = {
  id: string;
  name: string;
  code: string | null;
  type: string;
};

/** P&L section order + the AccountType each section collects. */
const PNL_SECTIONS: { key: string; label: string; accountType: string }[] = [
  { key: "operating-income", label: "Operating Income", accountType: "INCOME" },
  {
    key: "cost-of-goods-sold",
    label: "Cost of Goods Sold",
    accountType: "COST_OF_GOODS_SOLD",
  },
  {
    key: "operating-expense",
    label: "Operating Expense",
    accountType: "EXPENSE",
  },
  {
    key: "non-operating-income",
    label: "Non Operating Income",
    accountType: "OTHER_INCOME",
  },
  {
    key: "non-operating-expense",
    label: "Non Operating Expense",
    accountType: "OTHER_EXPENSE",
  },
];

function sortAccounts(a: AccountForStructure, b: AccountForStructure): number {
  // Mirrors lib/reports/profit-loss.ts: sort by code, falling back to
  // the account name when there's no code (numeric-aware, so "4020"
  // sorts before "4100").
  return (a.code ?? a.name).localeCompare(b.code ?? b.name, undefined, {
    numeric: true,
  });
}

function pnlSectionNode(
  def: (typeof PNL_SECTIONS)[number],
  accounts: AccountForStructure[],
): CustomReportSectionNode {
  return {
    kind: "section",
    key: def.key,
    label: def.label,
    accounts: accounts
      .filter((a) => a.type === def.accountType)
      .sort(sortAccounts)
      .map((a) => ({ id: a.id, name: a.name })),
  };
}

/**
 * Returns the ordered node list for the given base report, or `null`
 * when the report type doesn't have a structure editor yet.
 *
 * P&L order: Operating Income → Cost of Goods Sold → [fx Gross Profit]
 * → Operating Expense → [fx Operating Profit] → Non Operating Income →
 * Non Operating Expense → [fx Net Profit/Loss].
 */
export function buildCustomReportStructure(
  reportKey: string,
  accounts: AccountForStructure[],
): CustomReportSectionNode[] | null {
  if (reportKey !== "profit-and-loss") return null;

  const byKey = (k: string) =>
    pnlSectionNode(
      PNL_SECTIONS.find((s) => s.key === k)!,
      accounts,
    );

  return [
    byKey("operating-income"),
    byKey("cost-of-goods-sold"),
    { kind: "formula", label: "Gross Profit" },
    byKey("operating-expense"),
    { kind: "formula", label: "Operating Profit" },
    byKey("non-operating-income"),
    byKey("non-operating-expense"),
    { kind: "formula", label: "Net Profit/Loss" },
  ];
}
