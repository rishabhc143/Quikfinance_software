import Papa from "papaparse";
import ExcelJS from "exceljs";

/**
 * Parsed spreadsheet shape — same regardless of source format.
 *
 *   { headers: ["Name", "Type", …], rows: [{ Name: "Widget", Type: "GOODS" }, …] }
 *
 * Headers come from the FIRST row of the file (CSV header line / first
 * row of the XLSX sheet). Empty / whitespace-only header cells are
 * filtered out so the downstream mapper doesn't show blank options.
 */
export type ParsedSpreadsheet = {
  headers: string[];
  rows: Record<string, string>[];
};

/**
 * Format-agnostic spreadsheet parser used by every import wizard.
 *
 * Routes by file extension:
 *   - .csv  → Papa.parse with comma delimiter
 *   - .tsv  → Papa.parse with tab delimiter
 *   - .xlsx → ExcelJS, first sheet only
 *   - .xls  → ExcelJS, first sheet only
 *
 * Returns a uniform `{ headers, rows }` shape so the wizard's mapping
 * + preview code path is the same regardless of upload format. All
 * cell values are coerced to strings so the consumer doesn't have to
 * branch on Date/Number/Boolean cell types — the import action does
 * its own Number()/toUpperCase() etc. on the strings.
 *
 * Throws on:
 *   - unsupported extension (file the user picked outside the dropzone
 *     accept list, e.g. .ods)
 *   - empty file (no header row)
 *   - malformed CSV (Papa.parse error)
 *   - corrupted XLSX (ExcelJS load failure)
 *
 * Used by `app/(dashboard)/items/import/wizard.tsx` initially.
 * Other import wizards (sales/purchases/contacts/accountant) still
 * use Papa.parse directly; migrating them to this helper is a
 * follow-up sweep.
 */
export async function parseSpreadsheet(
  file: File,
): Promise<ParsedSpreadsheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv")) {
    return parseDelimited(file, name.endsWith(".tsv") ? "\t" : ",");
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseExcel(file);
  }
  throw new Error(
    `Unsupported file type: ${file.name}. Use CSV, TSV, XLS, or XLSX.`,
  );
}

async function parseDelimited(
  file: File,
  delimiter: string,
): Promise<ParsedSpreadsheet> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter,
  });
  if (parsed.errors.length > 0) {
    throw new Error(`Parse error: ${parsed.errors[0].message}`);
  }
  const rows = parsed.data;
  const headers = Object.keys(rows[0] ?? {}).filter((h) => h.trim() !== "");
  return { headers, rows };
}

async function parseExcel(file: File): Promise<ParsedSpreadsheet> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  // First sheet only — multi-sheet support is a future feature
  // (would need a sheet picker step in the wizard).
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("The file has no sheets.");

  // Header row = first non-empty row. Coerce to strings (ExcelJS
  // returns Date/Number/etc. for typed cells; we want labels).
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  // ExcelJS columns are 1-indexed; iterate until we hit a sparse end.
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    const v = cellToString(cell.value);
    if (v.trim() !== "") headers.push(v);
  });
  if (headers.length === 0) {
    throw new Error("The first row of the sheet is empty — expected column headers.");
  }

  const rows: Record<string, string>[] = [];
  // Start at row 2 (skip header). eachRow includes only populated rows.
  sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const obj: Record<string, string> = {};
    let hasAny = false;
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 1);
      const v = cellToString(cell.value);
      obj[h] = v;
      if (v.trim() !== "") hasAny = true;
    });
    if (hasAny) rows.push(obj);
  });

  return { headers, rows };
}

/**
 * Coerce an ExcelJS cell value to its string display form.
 *
 * Handles: primitives, Date objects, formula cells (uses `.result`),
 * rich-text (concatenates `.text` runs), shared strings, hyperlinks
 * (returns the text label, not the URL), error cells (returns "#ERR").
 *
 * Returns "" for null/undefined so the downstream mapper sees a
 * uniform string type.
 */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as {
      text?: unknown;
      result?: unknown;
      richText?: { text: string }[];
      hyperlink?: string;
      error?: string;
    };
    // Rich text — concatenate the run texts
    if (Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text).join("");
    }
    // Hyperlink cell — prefer the visible label
    if (typeof v.text === "string") return v.text;
    // Formula cell — use the computed result
    if (v.result !== undefined) return cellToString(v.result);
    // Error cell
    if (typeof v.error === "string") return v.error;
  }
  return String(value);
}
