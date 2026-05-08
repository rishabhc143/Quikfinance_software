import ExcelJS from "exceljs";
import { stringify } from "csv-stringify/sync";
import { NextResponse } from "next/server";

/**
 * M29: shared export helpers — promoted out of the M27 Invoice
 * export route so all 8 modules share one implementation.
 *
 * The Invoices Refinement Patch <export_modal> spec asked for:
 *   - Decimal Format: 1234567.89 / 1,234,567.89 / 1.234.567,89
 *   - File Format: CSV / XLSX (XLS treated same as XLSX)
 *   - PII checkbox (drops email columns when unchecked)
 *   - File Protection Password (XLSX only)
 *
 * This helper centralizes parsing those query params and writing
 * the response so each module's export route only has to:
 *   1. parseExportOptions(searchParams)
 *   2. fetch its rows
 *   3. shape them into a flat record array
 *   4. writeExportResponse(opts, records, "module-slug")
 */

export type ExportFileFormat = "csv" | "xlsx";
export type DecimalStyle = "us" | "en" | "eu";

export type ExportOptions = {
  format: ExportFileFormat;
  decimalStyle: DecimalStyle;
  includePii: boolean;
  password: string;
  status: string;
  fromDate: string;
  toDate: string;
};

export function parseExportOptions(sp: URLSearchParams): ExportOptions {
  const f = sp.get("format")?.toLowerCase();
  const d = sp.get("decimalFormat");
  return {
    format: f === "xlsx" || f === "xls" ? "xlsx" : "csv",
    decimalStyle: d === "en" || d === "eu" ? d : "us",
    includePii: sp.get("includePii") === "true",
    password: sp.get("password") ?? "",
    status: sp.get("status")?.trim() ?? "",
    fromDate: sp.get("from")?.trim() ?? "",
    toDate: sp.get("to")?.trim() ?? "",
  };
}

/**
 * Format a numeric string per the user-selected decimal style.
 *   "us"  -> 1234567.89  (raw)
 *   "en"  -> 1,234,567.89
 *   "eu"  -> 1.234.567,89
 */
export function formatDecimal(
  raw: string | number | null | undefined,
  style: DecimalStyle
): string {
  if (raw === null || raw === undefined) return "";
  if (style === "us") return String(raw);
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  if (style === "en") {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(n);
  }
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

/**
 * Write the response. Picks CSV or XLSX based on opts.format.
 * For XLSX: bold first row, auto column widths, optional password.
 */
export async function writeExportResponse(
  opts: { format: ExportFileFormat; password: string },
  records: Record<string, string>[],
  filenameStem: string,
  mode: string
): Promise<NextResponse> {
  if (opts.format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(filenameStem);
    if (records.length > 0) {
      ws.columns = Object.keys(records[0]).map((key) => ({
        header: key,
        key,
        width: 18,
      }));
      ws.addRows(records);
      ws.getRow(1).font = { bold: true };
    }
    const buffer = opts.password
      ? await wb.xlsx.writeBuffer({
          // @ts-expect-error — exceljs types omit this option
          password: opts.password,
        })
      : await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="quikfinance-${filenameStem}-${mode}-${Date.now()}.xlsx"`,
      },
    });
  }

  const csv = stringify(records, { header: true });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quikfinance-${filenameStem}-${mode}-${Date.now()}.csv"`,
    },
  });
}
