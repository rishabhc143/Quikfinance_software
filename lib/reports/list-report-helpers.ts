/**
 * REPORTS-INFRA — Pure helpers shared by `ListReportTemplate` and any
 * `.../export/route.ts` that builds CSV / XLSX / PDF from the same
 * column descriptor list.
 *
 * Keeping these in a server-safe lib (no React, no Prisma) means the
 * template + the export route + unit tests can all import the same
 * formatting/grouping primitives.
 */

import { format as formatDate } from "date-fns";

/** Column shape supported by `ListReportTemplate`. */
export type ListReportColumnType =
  | "text"
  | "number"
  | "money"
  | "date"
  | "datetime";

export interface ListReportColumn<TRow = Record<string, unknown>> {
  /** Object key on the row this column reads. */
  key: keyof TRow & string;
  /** Display label in the table header. */
  label: string;
  /** Type — drives default alignment + formatting. */
  type: ListReportColumnType;
  /** Override alignment (defaults: text/date = left, number/money = right). */
  align?: "left" | "right" | "center";
  /** Optional fixed width hint (Tailwind classes like "w-32"). */
  widthClass?: string;
  /** Optional per-cell renderer overriding the default formatter. */
  render?: (value: unknown, row: TRow) => React.ReactNode;
}

/**
 * Default alignment per column type. Numeric/monetary columns are
 * right-aligned by convention.
 */
export function defaultAlign(type: ListReportColumnType): "left" | "right" {
  return type === "money" || type === "number" ? "right" : "left";
}

/**
 * Format a cell value for *display* (table cell + PDF). Currency
 * formatting lives in `lib/money` — callers pass the currency code.
 */
export function formatCellForDisplay(
  value: unknown,
  type: ListReportColumnType,
  formatMoney: (n: number) => string,
): string {
  if (value === null || value === undefined || value === "") return "";
  switch (type) {
    case "text":
      return String(value);
    case "number":
      return typeof value === "number"
        ? new Intl.NumberFormat("en-IN").format(value)
        : String(value);
    case "money":
      return typeof value === "number" ? formatMoney(value) : String(value);
    case "date":
      return value instanceof Date
        ? formatDate(value, "dd/MM/yyyy")
        : String(value);
    case "datetime":
      return value instanceof Date
        ? formatDate(value, "dd/MM/yyyy HH:mm")
        : String(value);
  }
}

/**
 * Format a cell value for *export* (CSV / XLSX). Numbers stay numeric
 * so XLSX can sum them. Dates become ISO strings.
 */
export function formatCellForExport(
  value: unknown,
  type: ListReportColumnType,
): string | number {
  if (value === null || value === undefined) return "";
  switch (type) {
    case "text":
      return String(value);
    case "number":
    case "money":
      return typeof value === "number" ? value : Number(value) || 0;
    case "date":
      return value instanceof Date ? formatDate(value, "yyyy-MM-dd") : String(value);
    case "datetime":
      return value instanceof Date
        ? formatDate(value, "yyyy-MM-dd HH:mm:ss")
        : String(value);
  }
}
