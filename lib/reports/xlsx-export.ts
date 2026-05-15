/**
 * REPORTS-INFRA — Turn a homogeneous list of records into an Excel
 * (.xlsx) Buffer + a Next.js-friendly Response factory.
 *
 * Built on `exceljs` (already a project dependency). Mirrors the
 * shape of `lib/reports/csv-export.ts` so a report can offer both
 * formats from the same row data with no per-format glue:
 *
 *     const rows: XlsxRow[] = ...;
 *     const buf = await toXlsx({ sheetName: "Invoices", rows });
 *     return xlsxResponse("invoice-details-20260513", buf);
 *
 * Cells are typed per-column when possible (numbers stay numeric,
 * dates render as Excel date types) so users can sort / sum / pivot
 * inside Excel without reparsing strings.
 */

import ExcelJS from "exceljs";

export type XlsxCellPrimitive =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined;

export type XlsxRow = Record<string, XlsxCellPrimitive>;

export type XlsxColumn = {
  /** Map key from each row. */
  key: string;
  /** Display header text. */
  header: string;
  /** Optional column width in characters (default 16). */
  width?: number;
  /**
   * Excel number-format string applied to data cells in this column.
   * E.g., `'#,##0.00'` for money, `'yyyy-mm-dd'` for dates.
   * Omit for plain text / passthrough.
   */
  numFmt?: string;
};

export type XlsxBuildOptions = {
  sheetName?: string;
  /**
   * Column definitions in display order. If omitted, the union of
   * keys from the first row is used (no formatting hints).
   */
  columns?: XlsxColumn[];
  rows: XlsxRow[];
};

/**
 * Build an .xlsx file as a Buffer.
 *
 * The first row is the header with bold + grey fill so it stands
 * out when the file is opened. Column widths default to 16 unless
 * the caller specifies one.
 */
export async function toXlsx(opts: XlsxBuildOptions): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Quikfinance";
  wb.created = new Date();
  const ws = wb.addWorksheet(opts.sheetName ?? "Report");

  // Resolve columns. If none provided, infer from the first row.
  const cols: XlsxColumn[] =
    opts.columns && opts.columns.length > 0
      ? opts.columns
      : opts.rows[0]
        ? Object.keys(opts.rows[0]).map((k) => ({ key: k, header: k }))
        : [];

  ws.columns = cols.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? Math.max(c.header.length + 2, 16),
    style: c.numFmt ? { numFmt: c.numFmt } : undefined,
  }));

  // Header row formatting.
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE5E7EB" }, // tailwind gray-200
  };
  headerRow.alignment = { vertical: "middle" };

  // Body rows.
  for (const r of opts.rows) {
    ws.addRow(r);
  }

  // Freeze the header so it stays visible on scroll.
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Wrap an XLSX Buffer in a Next.js-compatible Response with the
 * right headers so the browser triggers a download. `filename`
 * should NOT include the .xlsx extension — we add it.
 */
export function xlsxResponse(filename: string, buf: Buffer): Response {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safe}.xlsx"`,
      "Cache-Control": "no-store",
      "Content-Length": String(buf.byteLength),
    },
  });
}

/**
 * Common numeric format strings used across reports. Centralised
 * so a tweak (e.g., changing money decimals from 2 → 4) lands in
 * one place.
 */
export const XLSX_FMT = {
  money: "#,##0.00",
  moneyZeroDash: "#,##0.00;-#,##0.00;-",
  integer: "#,##0",
  percent: "0.00%",
  dateIso: "yyyy-mm-dd",
  dateLong: 'mmm dd, yyyy',
} as const;
