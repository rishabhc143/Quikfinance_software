import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseSpreadsheet } from "@/lib/import/parse-spreadsheet";

/**
 * Pin parseSpreadsheet's contract: every supported file format
 * (CSV / TSV / XLSX) produces the same `{ headers, rows }` shape so
 * the import wizard's downstream mapping code stays format-agnostic.
 *
 * The wizard previously rejected XLSX with a toast, leaving users with
 * a dead Next button. These tests verify the unblock.
 */

/** Build a Blob with `name` so we can pass it to parseSpreadsheet without
 *  needing a real `File` constructor (which works in jsdom but the
 *  filename is what routes parsing). */
function fileFromString(name: string, content: string): File {
  return new File([content], name, { type: "text/csv" });
}

async function xlsxFile(name: string, rows: unknown[][]): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  rows.forEach((r) => sheet.addRow(r));
  const buffer = await wb.xlsx.writeBuffer();
  return new File([buffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("parseSpreadsheet — CSV", () => {
  it("parses headers and rows from a comma-delimited file", async () => {
    const csv = "Name,Type,Price\nWidget,GOODS,100\nService,SERVICE,500\n";
    const out = await parseSpreadsheet(fileFromString("items.csv", csv));
    expect(out.headers).toEqual(["Name", "Type", "Price"]);
    expect(out.rows).toEqual([
      { Name: "Widget", Type: "GOODS", Price: "100" },
      { Name: "Service", Type: "SERVICE", Price: "500" },
    ]);
  });

  it("filters out blank header columns", async () => {
    const csv = "Name,,Price\nWidget,,100\n";
    const out = await parseSpreadsheet(fileFromString("items.csv", csv));
    expect(out.headers).toEqual(["Name", "Price"]);
  });

  it("skips empty lines", async () => {
    const csv = "Name,Price\nWidget,100\n\nService,500\n";
    const out = await parseSpreadsheet(fileFromString("items.csv", csv));
    expect(out.rows).toHaveLength(2);
  });
});

describe("parseSpreadsheet — TSV", () => {
  it("parses tab-delimited files", async () => {
    const tsv = "Name\tType\tPrice\nWidget\tGOODS\t100\n";
    const out = await parseSpreadsheet(fileFromString("items.tsv", tsv));
    expect(out.headers).toEqual(["Name", "Type", "Price"]);
    expect(out.rows[0]).toEqual({ Name: "Widget", Type: "GOODS", Price: "100" });
  });
});

describe("parseSpreadsheet — XLSX (the bug-fix)", () => {
  it("parses headers and rows from a real XLSX file", async () => {
    const f = await xlsxFile("items.xlsx", [
      ["Name", "Type", "Price"],
      ["Widget", "GOODS", 100],
      ["Service", "SERVICE", 500],
    ]);
    const out = await parseSpreadsheet(f);
    expect(out.headers).toEqual(["Name", "Type", "Price"]);
    expect(out.rows).toEqual([
      { Name: "Widget", Type: "GOODS", Price: "100" },
      { Name: "Service", Type: "SERVICE", Price: "500" },
    ]);
  });

  it("coerces typed cells (Date, Number, Boolean) to display strings", async () => {
    const f = await xlsxFile("typed.xlsx", [
      ["Date", "Number", "Bool"],
      [new Date("2025-04-01"), 42, true],
    ]);
    const out = await parseSpreadsheet(f);
    expect(out.rows[0]).toMatchObject({
      Date: "2025-04-01",
      Number: "42",
      Bool: "true",
    });
  });

  it("skips entirely-blank rows in the body", async () => {
    const f = await xlsxFile("sparse.xlsx", [
      ["Name", "Price"],
      ["Widget", 100],
      [null, null],
      ["Service", 500],
    ]);
    const out = await parseSpreadsheet(f);
    expect(out.rows).toHaveLength(2);
    expect(out.rows.map((r) => r.Name)).toEqual(["Widget", "Service"]);
  });

  it("throws on a sheet with no headers", async () => {
    const f = await xlsxFile("empty.xlsx", []);
    await expect(parseSpreadsheet(f)).rejects.toThrow();
  });

  it("only reads the first sheet (multi-sheet workbooks)", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Primary").addRows([
      ["Name"],
      ["First sheet row"],
    ]);
    wb.addWorksheet("Secondary").addRows([
      ["Name"],
      ["Second sheet row"],
    ]);
    const buffer = await wb.xlsx.writeBuffer();
    const f = new File([buffer], "multi.xlsx");
    const out = await parseSpreadsheet(f);
    expect(out.rows).toEqual([{ Name: "First sheet row" }]);
  });
});

describe("parseSpreadsheet — unsupported formats", () => {
  it("throws a helpful message for .ods", async () => {
    const f = fileFromString("data.ods", "stub");
    await expect(parseSpreadsheet(f)).rejects.toThrow(/Unsupported file type/);
  });

  it("throws for files with no extension", async () => {
    const f = fileFromString("noextension", "Name,Price\nWidget,100\n");
    await expect(parseSpreadsheet(f)).rejects.toThrow(/Unsupported file type/);
  });
});
