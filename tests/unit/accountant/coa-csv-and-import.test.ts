import { describe, it, expect } from "vitest";
import {
  buildCoaCsv,
  buildCoaCsvRows,
  COA_CSV_COLUMNS,
  type CoaCsvRow,
} from "@/lib/accounting/coa-csv";
import {
  parseCoaCsv,
  parseAccountType,
  indexHeaders,
} from "@/lib/accounting/coa-import";

/**
 * ACCT-E.4 — Tests for the Chart of Accounts CSV builder + parser.
 * Round-trip is the key property: a row exported via buildCoaCsv
 * should re-parse cleanly via parseCoaCsv.
 */

const baseRow: CoaCsvRow = {
  code: "5000",
  name: "Rent Expense",
  type: "EXPENSE",
  subType: "Expense",
  parentName: null,
  parentCode: null,
  isActive: true,
  description: "Monthly office rent",
};

// ─────────────── COA_CSV_COLUMNS pin ───────────────

describe("COA_CSV_COLUMNS", () => {
  it("pins the column order accountants expect", () => {
    expect(COA_CSV_COLUMNS).toEqual([
      "Account Code",
      "Account Name",
      "Account Type",
      "Sub-type",
      "Parent Account",
      "Status",
      "System",
      "Description",
    ]);
  });
});

// ─────────────── buildCoaCsvRows ───────────────

describe("buildCoaCsvRows", () => {
  it("maps a single row with friendly labels", () => {
    const [r] = buildCoaCsvRows([baseRow]);
    expect(r).toEqual({
      "Account Code": "5000",
      "Account Name": "Rent Expense",
      "Account Type": "Expense",
      "Sub-type": "Expense",
      "Parent Account": "",
      Status: "Active",
      System: "No",
      Description: "Monthly office rent",
    });
  });

  it("marks SYS-* accounts as System=Yes", () => {
    const [r] = buildCoaCsvRows([
      { ...baseRow, code: "SYS-AR", name: "Accounts Receivable" },
    ]);
    expect(r.System).toBe("Yes");
  });

  it("renders archived rows as Status=Archived", () => {
    const [r] = buildCoaCsvRows([{ ...baseRow, isActive: false }]);
    expect(r.Status).toBe("Archived");
  });

  it("formats parent account as 'CODE · Name' when both are set", () => {
    const [r] = buildCoaCsvRows([
      {
        ...baseRow,
        parentName: "Office Expenses",
        parentCode: "5500",
      },
    ]);
    expect(r["Parent Account"]).toBe("5500 · Office Expenses");
  });

  it("falls back to just Name when parent has no code", () => {
    const [r] = buildCoaCsvRows([
      { ...baseRow, parentName: "Operating Expenses", parentCode: null },
    ]);
    expect(r["Parent Account"]).toBe("Operating Expenses");
  });

  it("renders null code + null sub-type as empty cells", () => {
    const [r] = buildCoaCsvRows([
      { ...baseRow, code: null, subType: null, description: null },
    ]);
    expect(r["Account Code"]).toBe("");
    expect(r["Sub-type"]).toBe("");
    expect(r.Description).toBe("");
  });
});

// ─────────────── buildCoaCsv (header + body) ───────────────

describe("buildCoaCsv", () => {
  it("emits a header row + data row in fixed column order", () => {
    const csv = buildCoaCsv([baseRow]);
    const [header, data] = csv.split("\r\n");
    expect(header).toBe(
      "Account Code,Account Name,Account Type,Sub-type,Parent Account,Status,System,Description"
    );
    expect(data).toBe(
      "5000,Rent Expense,Expense,Expense,,Active,No,Monthly office rent"
    );
  });

  it("escapes embedded commas (RFC 4180)", () => {
    const csv = buildCoaCsv([
      {
        ...baseRow,
        name: "Office, IT & Internet",
        description: "Includes hosting, SaaS",
      },
    ]);
    expect(csv).toContain('"Office, IT & Internet"');
    expect(csv).toContain('"Includes hosting, SaaS"');
  });
});

// ─────────────── parseAccountType ───────────────

describe("parseAccountType", () => {
  it("accepts Zoho-style display labels (case-insensitive)", () => {
    expect(parseAccountType("Asset")).toBe("ASSET");
    expect(parseAccountType("liability")).toBe("LIABILITY");
    expect(parseAccountType("EQUITY")).toBe("EQUITY");
    expect(parseAccountType("Cost of Goods Sold")).toBe("COST_OF_GOODS_SOLD");
    expect(parseAccountType("Other Income")).toBe("OTHER_INCOME");
  });

  it("returns null for unknown labels", () => {
    expect(parseAccountType("Cash")).toBeNull(); // Cash is a sub-type, not a type
    expect(parseAccountType("MadeUpType")).toBeNull();
    expect(parseAccountType("")).toBeNull();
  });
});

// ─────────────── indexHeaders ───────────────

describe("indexHeaders", () => {
  it("succeeds when the required columns are present", () => {
    const res = indexHeaders(["Account Name", "Account Type", "Description"]);
    expect(res.ok).toBe(true);
  });

  it("complains when a required column is missing", () => {
    const res = indexHeaders(["Account Code", "Description"]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(
        res.errors.some((e) => e.includes("Account Name"))
      ).toBe(true);
      expect(
        res.errors.some((e) => e.includes("Account Type"))
      ).toBe(true);
    }
  });

  it("case-insensitive header matching", () => {
    const res = indexHeaders(["account name", "ACCOUNT TYPE"]);
    expect(res.ok).toBe(true);
  });
});

// ─────────────── parseCoaCsv (end-to-end) ───────────────

const HEADER =
  "Account Code,Account Name,Account Type,Sub-type,Parent Account,Status,System,Description";

describe("parseCoaCsv — happy paths", () => {
  it("parses a single well-formed row", () => {
    const csv = `${HEADER}\n6300,Travel Expense,Expense,Expense,,Active,No,Business travel costs`;
    const res = parseCoaCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(1);
    const r = res.rows[0];
    expect(r.code).toBe("6300");
    expect(r.name).toBe("Travel Expense");
    expect(r.type).toBe("EXPENSE");
    expect(r.subType).toBe("Expense");
    expect(r.isActive).toBe(true);
  });

  it("treats blank Status as Active", () => {
    const csv = `${HEADER}\n,Custom Account,Asset,Other Asset,,,,`;
    const res = parseCoaCsv(csv);
    expect(res.rows[0].isActive).toBe(true);
  });

  it("treats Status=Archived as inactive", () => {
    const csv = `${HEADER}\n,Stale Account,Asset,Other Asset,,Archived,,`;
    const res = parseCoaCsv(csv);
    expect(res.rows[0].isActive).toBe(false);
  });

  it("accepts a row with no sub-type (broad type fallback)", () => {
    const csv = `${HEADER}\n,Generic Asset,Asset,,,,,`;
    const res = parseCoaCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.rows[0].subType).toBeNull();
  });
});

describe("parseCoaCsv — row errors", () => {
  it("flags missing Account Name", () => {
    const csv = `${HEADER}\n6300,,Expense,Expense,,,,Description here`;
    const res = parseCoaCsv(csv);
    expect(
      res.errors.some((e) => e.field === "Account Name")
    ).toBe(true);
    expect(res.rows).toEqual([]);
  });

  it("flags unknown Account Type", () => {
    const csv = `${HEADER}\n6300,X,GibberishType,,,,,`;
    const res = parseCoaCsv(csv);
    expect(
      res.errors.some((e) => e.field === "Account Type")
    ).toBe(true);
  });

  it("flags Sub-type that doesn't match the broad Type", () => {
    // "Cash" is an ASSET sub-type; pairing with EXPENSE is invalid.
    const csv = `${HEADER}\n,Misc,Expense,Cash,,,,`;
    const res = parseCoaCsv(csv);
    expect(res.errors.some((e) => e.field === "Sub-type")).toBe(true);
  });

  it("refuses to import a reserved SYS-* code", () => {
    const csv = `${HEADER}\nSYS-FAKE,Hostile Row,Asset,Other Asset,,,,`;
    const res = parseCoaCsv(csv);
    expect(
      res.errors.some(
        (e) => e.field === "Account Code" && e.message.includes("SYS-")
      )
    ).toBe(true);
  });

  it("flags duplicate names within the same file", () => {
    const csv = [
      HEADER,
      `,Same Name,Asset,Other Asset,,,,`,
      `,Same Name,Liability,Other Liability,,,,`,
    ].join("\n");
    const res = parseCoaCsv(csv);
    expect(res.rows).toHaveLength(1);
    expect(
      res.errors.some((e) =>
        e.message.toLowerCase().includes("duplicate name")
      )
    ).toBe(true);
  });

  it("rejects missing required column 'Account Name'", () => {
    const csv = "Account Code,Account Type\n6000,Expense";
    const res = parseCoaCsv(csv);
    expect(res.rows).toEqual([]);
    expect(
      res.errors.some((e) => e.message.includes("Account Name"))
    ).toBe(true);
  });

  it("complains about an empty file", () => {
    const res = parseCoaCsv("");
    expect(res.rows).toEqual([]);
    expect(res.errors[0].message).toMatch(/empty/i);
  });
});

// ─────────────── Round-trip ───────────────

describe("Round-trip: export → import re-parses cleanly", () => {
  it("export → parse keeps essential fields intact", () => {
    const inputs: CoaCsvRow[] = [
      { ...baseRow, code: "6300", name: "Travel Expense" },
      {
        ...baseRow,
        code: null,
        name: "Misc Asset",
        type: "ASSET",
        subType: "Other Asset",
        description: null,
      },
    ];
    const csv = buildCoaCsv(inputs);
    const res = parseCoaCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toMatchObject({
      code: "6300",
      name: "Travel Expense",
      type: "EXPENSE",
      subType: "Expense",
      isActive: true,
    });
    expect(res.rows[1]).toMatchObject({
      code: null,
      name: "Misc Asset",
      type: "ASSET",
      subType: "Other Asset",
      isActive: true,
    });
  });
});
