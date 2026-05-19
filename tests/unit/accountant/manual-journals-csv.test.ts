import { describe, it, expect } from "vitest";
import {
  buildManualJournalCsv,
  buildManualJournalCsvRows,
  isoDate,
  MANUAL_JOURNAL_CSV_COLUMNS,
  type ManualJournalCsvLine,
} from "@/lib/accounting/manual-journals-csv";

/**
 * ACCT-A.4.a — Tests for the pure CSV builder. Pin the column
 * order, escaping, status / reporting-method labels, and the
 * one-row-per-line layout so the export contract can't drift
 * silently.
 */

const baseLine: ManualJournalCsvLine = {
  date: new Date("2026-05-13T00:00:00.000Z"),
  number: "MJ-001",
  referenceNumber: "REF-1",
  status: "PUBLISHED",
  notes: "Quarterly accrual",
  currency: "INR",
  reportingMethod: "ACCRUAL_AND_CASH",
  accountCode: "1000",
  accountName: "Cash",
  description: "Cash payment",
  debit: 1000,
  credit: 0,
  contactName: null,
  projectName: null,
};

describe("isoDate", () => {
  it("formats yyyy-mm-dd in UTC", () => {
    expect(isoDate(new Date("2026-05-13T00:00:00.000Z"))).toBe("2026-05-13");
  });

  it("zero-pads single-digit months and days", () => {
    expect(isoDate(new Date("2026-01-05T00:00:00.000Z"))).toBe("2026-01-05");
  });
});

describe("MANUAL_JOURNAL_CSV_COLUMNS", () => {
  it("pins the column order accountants expect", () => {
    // Locking the order prevents a re-order from breaking downstream
    // tooling that consumes the CSV positionally.
    expect(MANUAL_JOURNAL_CSV_COLUMNS).toEqual([
      "Date",
      "Journal Number",
      "Reference Number",
      "Status",
      "Account Code",
      "Account Name",
      "Description",
      "Debit",
      "Credit",
      "Currency",
      "Reporting Method",
      "Contact",
      "Project",
      "Notes",
    ]);
  });
});

describe("buildManualJournalCsvRows", () => {
  it("maps a single line to a row with friendly labels + zeros preserved", () => {
    const [row] = buildManualJournalCsvRows([baseLine]);
    expect(row).toEqual({
      Date: "2026-05-13",
      "Journal Number": "MJ-001",
      "Reference Number": "REF-1",
      Status: "Published",
      "Account Code": "1000",
      "Account Name": "Cash",
      Description: "Cash payment",
      Debit: 1000,
      Credit: 0, // not blank — explicit zero matches the reference design
      Currency: "INR",
      "Reporting Method": "Accrual and Cash",
      Contact: "",
      Project: "",
      Notes: "Quarterly accrual",
    });
  });

  it("emits one row per line for a multi-line journal", () => {
    const rows = buildManualJournalCsvRows([
      baseLine,
      { ...baseLine, accountCode: "5000", accountName: "Rent", debit: 0, credit: 1000 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]["Account Name"]).toBe("Cash");
    expect(rows[1]["Account Name"]).toBe("Rent");
    // Header fields repeat on every line (spreadsheet pivot friendly).
    expect(rows[0]["Journal Number"]).toBe("MJ-001");
    expect(rows[1]["Journal Number"]).toBe("MJ-001");
  });

  it("renders null contact and project as empty cells", () => {
    const [row] = buildManualJournalCsvRows([baseLine]);
    expect(row.Contact).toBe("");
    expect(row.Project).toBe("");
  });

  it("renders contact + project names when set", () => {
    const [row] = buildManualJournalCsvRows([
      { ...baseLine, contactName: "Acme Vendor", projectName: "Q1 Marketing" },
    ]);
    expect(row.Contact).toBe("Acme Vendor");
    expect(row.Project).toBe("Q1 Marketing");
  });

  it("maps DRAFT + each ReportingMethod to its display label", () => {
    const [draft] = buildManualJournalCsvRows([
      { ...baseLine, status: "DRAFT", reportingMethod: "ACCRUAL_ONLY" },
    ]);
    expect(draft.Status).toBe("Draft");
    expect(draft["Reporting Method"]).toBe("Accrual Only");

    const [cash] = buildManualJournalCsvRows([
      { ...baseLine, reportingMethod: "CASH_ONLY" },
    ]);
    expect(cash["Reporting Method"]).toBe("Cash Only");
  });

  it("renders null description / referenceNumber as empty cells", () => {
    const [row] = buildManualJournalCsvRows([
      { ...baseLine, description: null, referenceNumber: null, notes: null },
    ]);
    expect(row.Description).toBe("");
    expect(row["Reference Number"]).toBe("");
    expect(row.Notes).toBe("");
  });

  it("falls through to the raw status / reportingMethod if unknown (forward-compat)", () => {
    const [row] = buildManualJournalCsvRows([
      { ...baseLine, status: "VOIDED", reportingMethod: "MTM_FX" },
    ]);
    expect(row.Status).toBe("VOIDED");
    expect(row["Reporting Method"]).toBe("MTM_FX");
  });
});

describe("buildManualJournalCsv", () => {
  it("produces a header row + data rows in fixed column order", () => {
    const csv = buildManualJournalCsv([baseLine]);
    const [header, dataLine] = csv.split("\r\n");
    expect(header).toBe(
      "Date,Journal Number,Reference Number,Status,Account Code,Account Name,Description,Debit,Credit,Currency,Reporting Method,Contact,Project,Notes"
    );
    expect(dataLine).toMatch(/^2026-05-13,MJ-001,REF-1,Published,1000,Cash,Cash payment,1000,0,INR,/);
  });

  it("escapes embedded commas + newlines (RFC 4180)", () => {
    const csv = buildManualJournalCsv([
      {
        ...baseLine,
        notes: "Line 1\nLine 2, with comma",
        description: 'Quote "test" inside',
      },
    ]);
    // Comma + newline force quoting; inner quotes double up.
    expect(csv).toContain('"Line 1\nLine 2, with comma"');
    expect(csv).toContain('"Quote ""test"" inside"');
  });

  it("returns just the header when given an empty array", () => {
    const csv = buildManualJournalCsv([]);
    // No data rows, but the header should still appear so the file
    // opens cleanly in Excel.
    expect(csv.split("\r\n")).toHaveLength(1);
    expect(csv).toContain("Journal Number");
  });
});
