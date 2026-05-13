/**
 * RPT-A — Tiny CSV builder + Next.js Response factory.
 *
 * Why home-grown rather than `csv-stringify` (already a dep)? Reports
 * have ~10–10,000 rows, no streaming required, and `csv-stringify`'s
 * sync API is heavier than we need (callbacks, options merging). This
 * file is ~50 LoC of pure, testable code that does exactly what RFC
 * 4180 says.
 *
 * Output convention:
 *   - Fields containing comma / quote / newline are wrapped in
 *     double-quotes; inner double-quotes are escaped to "".
 *   - Numbers render as-is (no quoting).
 *   - null / undefined → empty cell.
 *   - Booleans render as "true" / "false" — rare for reports.
 *   - Rows separated by `\r\n` (Excel-friendly).
 */

export type CsvCellPrimitive = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvCellPrimitive>;

const NEEDS_QUOTING = /[",\r\n]/;

function escape(cell: CsvCellPrimitive): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  const s = String(cell);
  if (NEEDS_QUOTING.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Convert an array of homogeneous record objects to a CSV string.
 * Pass `columns` to fix column order + names; otherwise the union of
 * keys from the first row is used.
 *
 * Empty input returns just the header row (or an empty string if no
 * columns are inferable either).
 */
export function toCsv(rows: CsvRow[], columns?: string[]): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  if (cols.length === 0) return "";
  const lines: string[] = [];
  lines.push(cols.map(escape).join(","));
  for (const row of rows) {
    lines.push(cols.map((c) => escape(row[c])).join(","));
  }
  return lines.join("\r\n");
}

/**
 * Wrap a CSV string in a Next.js-compatible Response with the right
 * headers so the browser triggers a download. `filename` should NOT
 * include the .csv extension — we add it.
 */
export function csvResponse(filename: string, csv: string): Response {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safe}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Format a yyyy-mm-dd suffix for filenames. */
export function csvDateSuffix(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
