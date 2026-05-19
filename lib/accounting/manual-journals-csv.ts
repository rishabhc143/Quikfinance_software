/**
 * ACCT-A.4.a — Pure CSV builder for Manual Journal exports.
 *
 * Emits **one row per line** (spec-compatible layout) so a single
 * journal with N lines produces N rows in the CSV. The header
 * fields are repeated on every line for spreadsheet pivot-table
 * friendliness.
 *
 * Pure — no DB, no auth. Tested in isolation; the route handler
 * shovels the rows + filename into `csvResponse`.
 */

import { toCsv, type CsvRow } from "@/lib/reports/csv-export";

/**
 * The flat input shape the route maps from its Prisma query result.
 * Kept narrow so the test file can construct fixtures without
 * pulling in Prisma types.
 */
export type ManualJournalCsvLine = {
  date: Date;
  number: string;
  referenceNumber: string | null;
  status: string; // "DRAFT" | "PUBLISHED"
  notes: string | null;
  currency: string;
  reportingMethod: string;
  accountCode: string | null;
  accountName: string;
  description: string | null;
  debit: number;
  credit: number;
  contactName: string | null;
  projectName: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
};

const REPORTING_METHOD_LABEL: Record<string, string> = {
  ACCRUAL_AND_CASH: "Accrual and Cash",
  ACCRUAL_ONLY: "Accrual Only",
  CASH_ONLY: "Cash Only",
};

/** Format a Date as yyyy-mm-dd in UTC — ISO-friendly + spreadsheet-friendly. */
export function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Column order — fixed so Excel pivot tables don't reshuffle and
 * downstream tooling can rely on it. Spelled-out names (not snake_case)
 * because accountants are the consumers, not engineers.
 */
export const MANUAL_JOURNAL_CSV_COLUMNS = [
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
] as const;

/** Build the CSV row collection for an array of denormalised lines. */
export function buildManualJournalCsvRows(
  lines: ManualJournalCsvLine[]
): CsvRow[] {
  return lines.map((l) => ({
    Date: isoDate(l.date),
    "Journal Number": l.number,
    "Reference Number": l.referenceNumber ?? "",
    Status: STATUS_LABEL[l.status] ?? l.status,
    "Account Code": l.accountCode ?? "",
    "Account Name": l.accountName,
    Description: l.description ?? "",
    // Numbers stay numeric so Excel doesn't coerce them to strings.
    // Cells with 0 render as "0" rather than blank for parity with
    // Third-party export convention — accountants prefer the explicit zero.
    Debit: l.debit,
    Credit: l.credit,
    Currency: l.currency,
    "Reporting Method":
      REPORTING_METHOD_LABEL[l.reportingMethod] ?? l.reportingMethod,
    Contact: l.contactName ?? "",
    Project: l.projectName ?? "",
    Notes: l.notes ?? "",
  }));
}

/** End-to-end: lines → CSV string with fixed column order. */
export function buildManualJournalCsv(lines: ManualJournalCsvLine[]): string {
  return toCsv(
    buildManualJournalCsvRows(lines),
    MANUAL_JOURNAL_CSV_COLUMNS as unknown as string[]
  );
}
