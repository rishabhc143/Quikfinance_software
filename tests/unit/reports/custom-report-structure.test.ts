import { describe, it, expect } from "vitest";
import {
  addReportColumn,
  addSection,
  availableReportColumns,
  buildCustomReportStructure,
  DEFAULT_REPORT_COLUMNS,
  removeReportColumn,
  removeReportNode,
  renameReportNode,
  reportColumnLabel,
  toEditableReportNodes,
  type AccountForStructure,
  type CustomReportSectionNode,
  type EditableReportNode,
} from "@/lib/reports/custom-report-structure";

/**
 * REPORTS — Pin the Custom Report wizard's Step 2 ("Customize Rows and
 * Columns") structure builder. This describes which rows the wizard
 * shows (sections grouped from the Chart of Accounts by AccountType,
 * interleaved with the P&L formula subtotal rows) — NOT amounts. The
 * AccountType→section mapping + ordering must stay in lock-step with
 * `lib/reports/profit-loss.ts`, so the canonical P&L node order and the
 * grouping rules each get explicit coverage.
 */

function section(
  nodes: CustomReportSectionNode[] | null,
  key: string
): Extract<CustomReportSectionNode, { kind: "section" }> {
  const node = nodes?.find((n) => n.kind === "section" && n.key === key);
  if (!node || node.kind !== "section") {
    throw new Error(`section "${key}" not found`);
  }
  return node;
}

describe("buildCustomReportStructure — unsupported report types", () => {
  it("returns null for report keys without a structure editor", () => {
    expect(buildCustomReportStructure("sales-by-customer", [])).toBeNull();
    expect(buildCustomReportStructure("ar-aging-summary", [])).toBeNull();
    expect(buildCustomReportStructure("general-ledger", [])).toBeNull();
    expect(buildCustomReportStructure("", [])).toBeNull();
  });
});

describe("buildCustomReportStructure — P&L node order", () => {
  it("returns the 8 nodes in canonical P&L order with formula rows interleaved", () => {
    const nodes = buildCustomReportStructure("profit-and-loss", []);
    expect(nodes).not.toBeNull();
    const list = nodes!;
    expect(list).toHaveLength(8);

    expect(list[0]).toMatchObject({
      kind: "section",
      key: "operating-income",
      label: "Operating Income",
    });
    expect(list[1]).toMatchObject({
      kind: "section",
      key: "cost-of-goods-sold",
      label: "Cost of Goods Sold",
    });
    expect(list[2]).toEqual({ kind: "formula", label: "Gross Profit" });
    expect(list[3]).toMatchObject({
      kind: "section",
      key: "operating-expense",
      label: "Operating Expense",
    });
    expect(list[4]).toEqual({ kind: "formula", label: "Operating Profit" });
    expect(list[5]).toMatchObject({
      kind: "section",
      key: "non-operating-income",
      label: "Non Operating Income",
    });
    expect(list[6]).toMatchObject({
      kind: "section",
      key: "non-operating-expense",
      label: "Non Operating Expense",
    });
    expect(list[7]).toEqual({ kind: "formula", label: "Net Profit/Loss" });
  });

  it("includes every section even when there are no accounts", () => {
    const nodes = buildCustomReportStructure("profit-and-loss", []);
    for (const key of [
      "operating-income",
      "cost-of-goods-sold",
      "operating-expense",
      "non-operating-income",
      "non-operating-expense",
    ]) {
      expect(section(nodes, key).accounts).toEqual([]);
    }
  });
});

describe("buildCustomReportStructure — account grouping", () => {
  const accounts: AccountForStructure[] = [
    { id: "i1", name: "Sales", code: "4000", type: "INCOME" },
    { id: "i2", name: "Service Revenue", code: "4100", type: "INCOME" },
    { id: "c1", name: "COGS", code: "5000", type: "COST_OF_GOODS_SOLD" },
    { id: "e1", name: "Rent", code: "6000", type: "EXPENSE" },
    { id: "oi1", name: "Interest Income", code: "4900", type: "OTHER_INCOME" },
    { id: "oe1", name: "Bank Charges", code: "6900", type: "OTHER_EXPENSE" },
  ];

  it("places each account under the section matching its AccountType", () => {
    const nodes = buildCustomReportStructure("profit-and-loss", accounts);
    expect(section(nodes, "operating-income").accounts.map((a) => a.name)).toEqual([
      "Sales",
      "Service Revenue",
    ]);
    expect(section(nodes, "cost-of-goods-sold").accounts.map((a) => a.name)).toEqual([
      "COGS",
    ]);
    expect(section(nodes, "operating-expense").accounts.map((a) => a.name)).toEqual([
      "Rent",
    ]);
    expect(
      section(nodes, "non-operating-income").accounts.map((a) => a.name)
    ).toEqual(["Interest Income"]);
    expect(
      section(nodes, "non-operating-expense").accounts.map((a) => a.name)
    ).toEqual(["Bank Charges"]);
  });

  it("exposes only id + name on section accounts (no code/type leak)", () => {
    const nodes = buildCustomReportStructure("profit-and-loss", accounts);
    expect(section(nodes, "operating-income").accounts[0]).toEqual({
      id: "i1",
      name: "Sales",
    });
  });

  it("ignores balance-sheet account types (ASSET / LIABILITY / EQUITY)", () => {
    const withBalanceSheet: AccountForStructure[] = [
      ...accounts,
      { id: "a1", name: "Cash", code: "1000", type: "ASSET" },
      { id: "l1", name: "Loan", code: "2000", type: "LIABILITY" },
      { id: "eq1", name: "Capital", code: "3000", type: "EQUITY" },
    ];
    const nodes = buildCustomReportStructure("profit-and-loss", withBalanceSheet);
    const names = nodes!
      .filter(
        (n): n is Extract<CustomReportSectionNode, { kind: "section" }> =>
          n.kind === "section"
      )
      .flatMap((n) => n.accounts.map((a) => a.name));
    expect(names).not.toContain("Cash");
    expect(names).not.toContain("Loan");
    expect(names).not.toContain("Capital");
    expect(names).toHaveLength(6);
  });
});

describe("buildCustomReportStructure — sort order within a section", () => {
  it("sorts by code (numeric-aware), falling back to name when code is null", () => {
    const accounts: AccountForStructure[] = [
      { id: "a", name: "Bravo", code: "4100", type: "INCOME" },
      { id: "b", name: "Alpha", code: "4020", type: "INCOME" },
      // No code → sorts by its name; "Zebra" falls after the numeric codes.
      { id: "c", name: "Zebra", code: null, type: "INCOME" },
    ];
    const nodes = buildCustomReportStructure("profit-and-loss", accounts);
    expect(section(nodes, "operating-income").accounts.map((a) => a.name)).toEqual([
      "Alpha",
      "Bravo",
      "Zebra",
    ]);
  });

  it("orders code-less accounts among themselves by name", () => {
    const accounts: AccountForStructure[] = [
      { id: "c", name: "Charlie", code: null, type: "EXPENSE" },
      { id: "a", name: "Alpha", code: null, type: "EXPENSE" },
    ];
    const nodes = buildCustomReportStructure("profit-and-loss", accounts);
    expect(section(nodes, "operating-expense").accounts.map((a) => a.name)).toEqual([
      "Alpha",
      "Charlie",
    ]);
  });
});

describe("buildCustomReportStructure — Balance Sheet", () => {
  const accounts: AccountForStructure[] = [
    { id: "a1", name: "Cash", code: "1000", type: "ASSET" },
    { id: "a2", name: "Bank", code: "1100", type: "ASSET" },
    { id: "l1", name: "Trade Payables", code: "2000", type: "LIABILITY" },
    { id: "e1", name: "Owners Capital", code: "3000", type: "EQUITY" },
    // P&L accounts must be ignored by the BS wizard.
    { id: "i1", name: "Sales", code: "4000", type: "INCOME" },
    { id: "x1", name: "Rent", code: "6000", type: "EXPENSE" },
  ];

  it("returns the 7 nodes in canonical Balance Sheet order", () => {
    const list = buildCustomReportStructure("balance-sheet", accounts)!;
    expect(list).toHaveLength(7);
    expect(list[0]).toMatchObject({ kind: "section", key: "assets" });
    expect(list[1]).toEqual({ kind: "formula", label: "Total Assets" });
    expect(list[2]).toMatchObject({ kind: "section", key: "liabilities" });
    expect(list[3]).toEqual({ kind: "formula", label: "Total Liabilities" });
    expect(list[4]).toMatchObject({ kind: "section", key: "equity" });
    expect(list[5]).toEqual({ kind: "formula", label: "Total Equity" });
    expect(list[6]).toEqual({
      kind: "formula",
      label: "Total Liabilities & Equity",
    });
  });

  it("places each balance-sheet account under the section matching its AccountType", () => {
    const list = buildCustomReportStructure("balance-sheet", accounts);
    expect(section(list, "assets").accounts.map((a) => a.name)).toEqual([
      "Cash",
      "Bank",
    ]);
    expect(section(list, "liabilities").accounts.map((a) => a.name)).toEqual([
      "Trade Payables",
    ]);
    expect(section(list, "equity").accounts.map((a) => a.name)).toEqual([
      "Owners Capital",
    ]);
  });

  it("ignores P&L account types (INCOME / EXPENSE / etc.)", () => {
    const list = buildCustomReportStructure("balance-sheet", accounts)!;
    const names = list
      .filter(
        (n): n is Extract<CustomReportSectionNode, { kind: "section" }> =>
          n.kind === "section"
      )
      .flatMap((n) => n.accounts.map((a) => a.name));
    expect(names).not.toContain("Sales");
    expect(names).not.toContain("Rent");
  });

  it("treats horizontal-balance-sheet and balance-sheet-schedule-iii as the same canonical structure", () => {
    const canonical = buildCustomReportStructure("balance-sheet", accounts);
    expect(
      buildCustomReportStructure("horizontal-balance-sheet", accounts)
    ).toEqual(canonical);
    expect(
      buildCustomReportStructure("balance-sheet-schedule-iii", accounts)
    ).toEqual(canonical);
  });
});

describe("buildCustomReportStructure — Trial Balance", () => {
  const accounts: AccountForStructure[] = [
    { id: "a1", name: "Cash", code: "1000", type: "ASSET" },
    { id: "l1", name: "Loan", code: "2000", type: "LIABILITY" },
    { id: "e1", name: "Capital", code: "3000", type: "EQUITY" },
    { id: "i1", name: "Sales", code: "4000", type: "INCOME" },
    { id: "oi1", name: "Interest", code: "4900", type: "OTHER_INCOME" },
    { id: "c1", name: "COGS", code: "5000", type: "COST_OF_GOODS_SOLD" },
    { id: "x1", name: "Rent", code: "6000", type: "EXPENSE" },
    { id: "ox1", name: "Bank Charges", code: "6900", type: "OTHER_EXPENSE" },
  ];

  it("returns one section per AccountType plus a Total formula row (9 nodes)", () => {
    const list = buildCustomReportStructure("trial-balance", accounts)!;
    expect(list).toHaveLength(9);
    expect(list.map((n) => n.kind)).toEqual([
      "section",
      "section",
      "section",
      "section",
      "section",
      "section",
      "section",
      "section",
      "formula",
    ]);
    expect(list[8]).toEqual({ kind: "formula", label: "Total" });
  });

  it("orders sections balance-sheet accounts first, then P&L accounts", () => {
    const list = buildCustomReportStructure("trial-balance", accounts)!;
    const sectionKeys = list
      .filter(
        (n): n is Extract<CustomReportSectionNode, { kind: "section" }> =>
          n.kind === "section"
      )
      .map((n) => n.key);
    expect(sectionKeys).toEqual([
      "tb-assets",
      "tb-liabilities",
      "tb-equity",
      "tb-income",
      "tb-other-income",
      "tb-cogs",
      "tb-expense",
      "tb-other-expense",
    ]);
  });

  it("populates every section with the accounts matching its AccountType", () => {
    const list = buildCustomReportStructure("trial-balance", accounts);
    expect(section(list, "tb-assets").accounts.map((a) => a.name)).toEqual([
      "Cash",
    ]);
    expect(
      section(list, "tb-other-income").accounts.map((a) => a.name)
    ).toEqual(["Interest"]);
    expect(section(list, "tb-cogs").accounts.map((a) => a.name)).toEqual([
      "COGS",
    ]);
    expect(
      section(list, "tb-other-expense").accounts.map((a) => a.name)
    ).toEqual(["Bank Charges"]);
  });
});

describe("buildCustomReportStructure — Cash Flow Statement", () => {
  // Cash Flow can't auto-classify accounts (Operating vs Investing vs
  // Financing isn't a property of the Chart of Accounts), so the wizard
  // hands the user empty sections to populate manually.
  it("returns 3 empty activity sections + 4 formula rows (7 nodes)", () => {
    const list = buildCustomReportStructure("cash-flow-statement", [])!;
    expect(list).toHaveLength(7);
    expect(list[0]).toMatchObject({
      kind: "section",
      key: "cf-operating",
      accounts: [],
    });
    expect(list[1]).toEqual({
      kind: "formula",
      label: "Net Cash from Operating Activities",
    });
    expect(list[2]).toMatchObject({
      kind: "section",
      key: "cf-investing",
      accounts: [],
    });
    expect(list[3]).toEqual({
      kind: "formula",
      label: "Net Cash from Investing Activities",
    });
    expect(list[4]).toMatchObject({
      kind: "section",
      key: "cf-financing",
      accounts: [],
    });
    expect(list[5]).toEqual({
      kind: "formula",
      label: "Net Cash from Financing Activities",
    });
    expect(list[6]).toEqual({ kind: "formula", label: "Net Change in Cash" });
  });

  it("keeps the activity sections empty even when accounts are supplied", () => {
    const accounts: AccountForStructure[] = [
      { id: "a1", name: "Cash", code: "1000", type: "ASSET" },
      { id: "i1", name: "Sales", code: "4000", type: "INCOME" },
    ];
    const list = buildCustomReportStructure("cash-flow-statement", accounts)!;
    for (const node of list) {
      if (node.kind === "section") expect(node.accounts).toEqual([]);
    }
  });
});

describe("buildCustomReportStructure — P&L canonical variants", () => {
  // The horizontal layout and Schedule III formatting are presentation
  // variants of the same report; the wizard tree must match.
  const accounts: AccountForStructure[] = [
    { id: "i1", name: "Sales", code: "4000", type: "INCOME" },
  ];
  it("horizontal-profit-and-loss + profit-and-loss-schedule-iii share the P&L structure", () => {
    const canonical = buildCustomReportStructure("profit-and-loss", accounts);
    expect(
      buildCustomReportStructure("horizontal-profit-and-loss", accounts)
    ).toEqual(canonical);
    expect(
      buildCustomReportStructure("profit-and-loss-schedule-iii", accounts)
    ).toEqual(canonical);
  });
});

describe("toEditableReportNodes", () => {
  it("uses section keys as ids and index-based ids for formula rows", () => {
    const structure = buildCustomReportStructure("profit-and-loss", [])!;
    const nodes = toEditableReportNodes(structure);
    expect(nodes).toHaveLength(structure.length);
    expect(nodes[0]).toMatchObject({ id: "operating-income", kind: "section" });
    // Gross Profit formula sits at index 2 in the P&L structure.
    expect(nodes[2]).toEqual({
      id: "formula-2",
      kind: "formula",
      label: "Gross Profit",
    });
  });
});

describe("addSection", () => {
  it("appends one custom, empty, renamable section without mutating the input", () => {
    const before: EditableReportNode[] = [];
    const after = addSection(before);
    expect(before).toHaveLength(0); // input not mutated
    expect(after).toHaveLength(1);
    const node = after[0];
    expect(node.kind).toBe("section");
    if (node.kind === "section") {
      expect(node.label).toBe("New Section");
      expect(node.custom).toBe(true);
      expect(node.accounts).toEqual([]);
      expect(node.id.length).toBeGreaterThan(0);
    }
  });

  it("gives each added section a distinct id", () => {
    const nodes = addSection(addSection([]));
    expect(nodes[0].id).not.toBe(nodes[1].id);
  });
});

describe("removeReportNode", () => {
  it("removes the node with the given id and keeps the rest", () => {
    const nodes = toEditableReportNodes(
      buildCustomReportStructure("profit-and-loss", [])!,
    );
    const next = removeReportNode(nodes, "operating-income");
    expect(next.find((n) => n.id === "operating-income")).toBeUndefined();
    expect(next).toHaveLength(nodes.length - 1);
  });

  it("is a no-op for an unknown id", () => {
    expect(removeReportNode(addSection([]), "nope")).toHaveLength(1);
  });
});

describe("renameReportNode", () => {
  it("renames a section by id", () => {
    const nodes = addSection([]);
    const next = renameReportNode(nodes, nodes[0].id, "Revenue");
    const node = next[0];
    expect(node.kind === "section" && node.label).toBe("Revenue");
  });

  it("leaves formula rows untouched", () => {
    const nodes = toEditableReportNodes(
      buildCustomReportStructure("profit-and-loss", [])!,
    );
    const next = renameReportNode(nodes, "formula-2", "Hacked");
    expect(next.find((n) => n.id === "formula-2")).toEqual({
      id: "formula-2",
      kind: "formula",
      label: "Gross Profit",
    });
  });
});

describe("report columns (Customize Columns)", () => {
  it("defaults to Account + Total", () => {
    expect(DEFAULT_REPORT_COLUMNS).toEqual(["account", "total"]);
  });

  it("availableReportColumns returns the catalog minus selected", () => {
    const avail = availableReportColumns(["account", "total"]);
    expect(avail.map((c) => c.key)).toEqual([
      "account-description",
      "year-to-date",
    ]);
  });

  it("addReportColumn appends without duplicating", () => {
    expect(addReportColumn(["account"], "total")).toEqual(["account", "total"]);
    expect(addReportColumn(["account"], "account")).toEqual(["account"]);
  });

  it("removeReportColumn drops the key", () => {
    expect(removeReportColumn(["account", "total"], "account")).toEqual([
      "total",
    ]);
  });

  it("reportColumnLabel resolves labels and falls back to the key", () => {
    expect(reportColumnLabel("year-to-date")).toBe("Year To Date");
    expect(reportColumnLabel("nope")).toBe("nope");
  });
});
