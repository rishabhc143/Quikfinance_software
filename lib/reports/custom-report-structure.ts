/**
 * REPORTS — Custom Report wizard, Step 2 ("Customize Rows and Columns").
 *
 * Builds the *structural* node list shown in the wizard's Customize
 * Table view — sections (grouped from the org's Chart of Accounts by
 * AccountType) interleaved with the report's formula subtotal rows.
 * This describes which rows appear, NOT their amounts, so it needs no
 * ledger aggregation — just the account list + the report's section map.
 *
 * Supported report families:
 *   - Profit & Loss (`profit-and-loss`, `horizontal-profit-and-loss`,
 *     `profit-and-loss-schedule-iii`) — INCOME / COGS / EXPENSE split
 *     mirrors `lib/reports/profit-loss.ts`
 *   - Balance Sheet (`balance-sheet`, `horizontal-balance-sheet`,
 *     `balance-sheet-schedule-iii`) — ASSET / LIABILITY / EQUITY split
 *     mirrors `lib/reports/balance-sheet.ts`
 *   - Trial Balance (`trial-balance`) — one section per AccountType
 *   - Cash Flow Statement (`cash-flow-statement`) — three empty
 *     activity sections (Operating / Investing / Financing); the user
 *     manually adds the relevant accounts since CF activity
 *     classification isn't stored on the Chart of Accounts.
 *
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

/** A section definition: which AccountType (or types) it collects. */
type SectionDef = { key: string; label: string; accountTypes: string[] };

/** P&L section order + the AccountType each section collects. */
const PNL_SECTIONS: SectionDef[] = [
  {
    key: "operating-income",
    label: "Operating Income",
    accountTypes: ["INCOME"],
  },
  {
    key: "cost-of-goods-sold",
    label: "Cost of Goods Sold",
    accountTypes: ["COST_OF_GOODS_SOLD"],
  },
  {
    key: "operating-expense",
    label: "Operating Expense",
    accountTypes: ["EXPENSE"],
  },
  {
    key: "non-operating-income",
    label: "Non Operating Income",
    accountTypes: ["OTHER_INCOME"],
  },
  {
    key: "non-operating-expense",
    label: "Non Operating Expense",
    accountTypes: ["OTHER_EXPENSE"],
  },
];

/**
 * Balance Sheet sections — one per top-level AccountType. The actual
 * BS report subdivides ASSET into Current / Non-Current / Fixed using
 * `accountSubType` (see `lib/reports/balance-sheet.ts` `bucketFor`),
 * but the wizard intentionally keeps a flat structure: the user can
 * add custom subsection rows via the "Add Section" action if they want
 * to mirror their internal layout. Keeps the AccountForStructure
 * payload minimal (no subType column).
 */
const BS_SECTIONS: SectionDef[] = [
  { key: "assets", label: "Assets", accountTypes: ["ASSET"] },
  { key: "liabilities", label: "Liabilities", accountTypes: ["LIABILITY"] },
  { key: "equity", label: "Equity", accountTypes: ["EQUITY"] },
];

/**
 * Trial Balance sections — one per AccountType, ordered the standard
 * way (assets → liabilities → equity → income → COGS → expenses).
 * Mirrors how Indian Indian CAs lay out TBs: balance-sheet accounts
 * first, then P&L accounts. The single "Total" formula row at the
 * bottom stands in for the balanced debit-credit footer.
 */
const TB_SECTIONS: SectionDef[] = [
  { key: "tb-assets", label: "Assets", accountTypes: ["ASSET"] },
  { key: "tb-liabilities", label: "Liabilities", accountTypes: ["LIABILITY"] },
  { key: "tb-equity", label: "Equity", accountTypes: ["EQUITY"] },
  { key: "tb-income", label: "Income", accountTypes: ["INCOME"] },
  {
    key: "tb-other-income",
    label: "Other Income",
    accountTypes: ["OTHER_INCOME"],
  },
  {
    key: "tb-cogs",
    label: "Cost of Goods Sold",
    accountTypes: ["COST_OF_GOODS_SOLD"],
  },
  { key: "tb-expense", label: "Expenses", accountTypes: ["EXPENSE"] },
  {
    key: "tb-other-expense",
    label: "Other Expenses",
    accountTypes: ["OTHER_EXPENSE"],
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

function sectionNode(
  def: SectionDef,
  accounts: AccountForStructure[],
): CustomReportSectionNode {
  return {
    kind: "section",
    key: def.key,
    label: def.label,
    accounts: accounts
      .filter((a) => def.accountTypes.includes(a.type))
      .sort(sortAccounts)
      .map((a) => ({ id: a.id, name: a.name })),
  };
}

function buildPnlStructure(
  accounts: AccountForStructure[],
): CustomReportSectionNode[] {
  const byKey = (k: string) =>
    sectionNode(PNL_SECTIONS.find((s) => s.key === k)!, accounts);
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

function buildBalanceSheetStructure(
  accounts: AccountForStructure[],
): CustomReportSectionNode[] {
  const byKey = (k: string) =>
    sectionNode(BS_SECTIONS.find((s) => s.key === k)!, accounts);
  return [
    byKey("assets"),
    { kind: "formula", label: "Total Assets" },
    byKey("liabilities"),
    { kind: "formula", label: "Total Liabilities" },
    byKey("equity"),
    { kind: "formula", label: "Total Equity" },
    { kind: "formula", label: "Total Liabilities & Equity" },
  ];
}

function buildTrialBalanceStructure(
  accounts: AccountForStructure[],
): CustomReportSectionNode[] {
  return [
    ...TB_SECTIONS.map((def) => sectionNode(def, accounts)),
    { kind: "formula", label: "Total" },
  ];
}

/**
 * Cash Flow has fixed activity sections but the underlying accounts
 * cannot be auto-classified — the chart of accounts doesn't carry an
 * "Operating / Investing / Financing" tag. So we return empty sections
 * the user populates manually via the wizard's "Add Account" action.
 */
function buildCashFlowStructure(): CustomReportSectionNode[] {
  return [
    {
      kind: "section",
      key: "cf-operating",
      label: "Cash Flow from Operating Activities",
      accounts: [],
    },
    { kind: "formula", label: "Net Cash from Operating Activities" },
    {
      kind: "section",
      key: "cf-investing",
      label: "Cash Flow from Investing Activities",
      accounts: [],
    },
    { kind: "formula", label: "Net Cash from Investing Activities" },
    {
      kind: "section",
      key: "cf-financing",
      label: "Cash Flow from Financing Activities",
      accounts: [],
    },
    { kind: "formula", label: "Net Cash from Financing Activities" },
    { kind: "formula", label: "Net Change in Cash" },
  ];
}

/**
 * Normalise variant report keys (horizontal / schedule-iii layouts)
 * to the canonical key used by `buildCustomReportStructure`. The
 * variants change presentation (rotated columns, regulatory headers),
 * not the underlying section + formula structure, so they share the
 * same wizard tree.
 */
function canonicalReportKey(reportKey: string): string {
  if (
    reportKey === "horizontal-profit-and-loss" ||
    reportKey === "profit-and-loss-schedule-iii"
  ) {
    return "profit-and-loss";
  }
  if (
    reportKey === "horizontal-balance-sheet" ||
    reportKey === "balance-sheet-schedule-iii"
  ) {
    return "balance-sheet";
  }
  return reportKey;
}

/**
 * Returns the ordered node list for the given base report, or `null`
 * when the report type doesn't have a structure editor yet.
 *
 * P&L order: Operating Income → COGS → [fx Gross Profit] → Operating
 *   Expense → [fx Operating Profit] → Non Operating Income → Non
 *   Operating Expense → [fx Net Profit/Loss].
 * Balance Sheet order: Assets → [fx Total Assets] → Liabilities →
 *   [fx Total Liabilities] → Equity → [fx Total Equity] →
 *   [fx Total Liabilities & Equity].
 * Trial Balance order: Assets → Liabilities → Equity → Income →
 *   Other Income → COGS → Expenses → Other Expenses → [fx Total].
 * Cash Flow order: Operating Activities → [fx Net …] → Investing
 *   Activities → [fx Net …] → Financing Activities → [fx Net …] →
 *   [fx Net Change in Cash].
 */
export function buildCustomReportStructure(
  reportKey: string,
  accounts: AccountForStructure[],
): CustomReportSectionNode[] | null {
  const canonical = canonicalReportKey(reportKey);
  switch (canonical) {
    case "profit-and-loss":
      return buildPnlStructure(accounts);
    case "balance-sheet":
      return buildBalanceSheetStructure(accounts);
    case "trial-balance":
      return buildTrialBalanceStructure(accounts);
    case "cash-flow-statement":
      return buildCashFlowStructure();
    default:
      return null;
  }
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
