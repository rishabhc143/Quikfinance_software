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

/* ────────────────────────────────────────────────────────────────────
 * Step 2 client-side editing
 *
 * The server hands the wizard an immutable `CustomReportSectionNode[]`.
 * To let the user add / rename / remove rows live, the wizard seeds a
 * local list of `EditableReportNode`s — same shape plus a stable `id`
 * per node (needed for React keys and targeted edits). These helpers
 * are pure so the editing behaviour is unit-testable without rendering.
 * ──────────────────────────────────────────────────────────────────── */

export type EditableReportNode =
  | {
      id: string;
      kind: "section";
      label: string;
      accounts: { id: string; name: string }[];
      /** True for user-added sections (renamable inline). */
      custom?: boolean;
    }
  | { id: string; kind: "formula"; label: string };

function makeNodeId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${rand}`;
}

/**
 * Seed an editable node list from a server-built structure, assigning a
 * stable id to each node (sections reuse their `key`; formula rows get
 * an index-based id since they have no natural key).
 */
export function toEditableReportNodes(
  structure: CustomReportSectionNode[],
): EditableReportNode[] {
  return structure.map((node, i) =>
    node.kind === "section"
      ? {
          id: node.key,
          kind: "section",
          label: node.label,
          accounts: node.accounts,
        }
      : { id: `formula-${i}`, kind: "formula", label: node.label },
  );
}

/** Append a new, empty, user-named section to the end of the list. */
export function addSection(
  nodes: EditableReportNode[],
): EditableReportNode[] {
  return [
    ...nodes,
    {
      id: makeNodeId("section"),
      kind: "section",
      label: "New Section",
      accounts: [],
      custom: true,
    },
  ];
}

/** Remove any node (section or formula row) by id. */
export function removeReportNode(
  nodes: EditableReportNode[],
  id: string,
): EditableReportNode[] {
  return nodes.filter((n) => n.id !== id);
}

/** Rename a section node by id. No-op for formula nodes / unknown ids. */
export function renameReportNode(
  nodes: EditableReportNode[],
  id: string,
  label: string,
): EditableReportNode[] {
  return nodes.map((n) =>
    n.id === id && n.kind === "section" ? { ...n, label } : n,
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Step 2 — Customize Columns
 *
 * Which value columns appear to the right of the (fixed) Account
 * Definition tree. The user picks from this catalog via the Customize
 * Columns dialog. Pure helpers so the move / filter behaviour is
 * unit-testable without rendering.
 * ──────────────────────────────────────────────────────────────────── */

export type ReportColumn = {
  key: string;
  label: string;
  /** Right-align numeric columns. */
  align?: "right";
};

/** Catalog of selectable value columns (Account Definition is always shown). */
export const REPORT_COLUMNS: ReportColumn[] = [
  { key: "account", label: "Account" },
  { key: "total", label: "Total", align: "right" },
  { key: "account-description", label: "Account Description" },
  { key: "year-to-date", label: "Year To Date", align: "right" },
];

/** Columns shown by default (mirrors the report's normal layout). */
export const DEFAULT_REPORT_COLUMNS: string[] = ["account", "total"];

export function reportColumn(key: string): ReportColumn | undefined {
  return REPORT_COLUMNS.find((c) => c.key === key);
}

export function reportColumnLabel(key: string): string {
  return reportColumn(key)?.label ?? key;
}

/** Catalog columns not currently selected (the "Available Columns" list). */
export function availableReportColumns(selected: string[]): ReportColumn[] {
  return REPORT_COLUMNS.filter((c) => !selected.includes(c.key));
}

/** Add a column key to the selected list (append, no duplicates). */
export function addReportColumn(selected: string[], key: string): string[] {
  return selected.includes(key) ? selected : [...selected, key];
}

/** Remove a column key from the selected list. */
export function removeReportColumn(
  selected: string[],
  key: string,
): string[] {
  return selected.filter((k) => k !== key);
}
