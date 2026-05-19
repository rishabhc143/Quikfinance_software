import type { AccountType } from "@prisma/client";
import { toCsv, type CsvRow } from "@/lib/reports/csv-export";

/**
 * ACCT-E.4 — Pure CSV builder for Chart of Accounts export.
 *
 * One row per account. Columns:
 *   Account Code · Account Name · Account Type · Sub-type ·
 *   Parent Account · Status · System · Description
 *
 * Pure — no Prisma, no DB. The route handler shovels the rows
 * into `csvResponse`.
 */

export type CoaCsvRow = {
  code: string | null;
  name: string;
  type: AccountType;
  subType: string | null;
  parentName: string | null;
  parentCode: string | null;
  isActive: boolean;
  description: string | null;
};

const TYPE_LABEL: Record<AccountType, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
  COST_OF_GOODS_SOLD: "Cost of Goods Sold",
  OTHER_INCOME: "Other Income",
  OTHER_EXPENSE: "Other Expense",
};

/** Column order — pinned so downstream tooling stays stable. */
export const COA_CSV_COLUMNS = [
  "Account Code",
  "Account Name",
  "Account Type",
  "Sub-type",
  "Parent Account",
  "Status",
  "System",
  "Description",
] as const;

function isSystemCode(code: string | null): boolean {
  return code?.startsWith("SYS-") ?? false;
}

/**
 * ACCT-E.4 — decimal format option for the export modal.
 *
 *   - "1234567.89"   period decimal, no thousand separator (US-ish)
 *   - "1,234,567.89" period decimal + comma thousands (US standard)
 *   - "1.234.567,89" comma decimal + period thousands (EU/de-DE)
 *
 * CoA rows don't currently surface numeric values in the CSV, so
 * the option is here for parity with the reference UX and for the moment
 * when we add a Balance column.
 */
export type DecimalFormat = "1234567.89" | "1,234,567.89" | "1.234.567,89";

export function buildCoaCsvRows(rows: CoaCsvRow[]): CsvRow[] {
  return rows.map((r) => {
    const parent = r.parentName
      ? r.parentCode
        ? `${r.parentCode} · ${r.parentName}`
        : r.parentName
      : "";
    return {
      "Account Code": r.code ?? "",
      "Account Name": r.name,
      "Account Type": TYPE_LABEL[r.type] ?? r.type,
      "Sub-type": r.subType ?? "",
      "Parent Account": parent,
      Status: r.isActive ? "Active" : "Archived",
      System: isSystemCode(r.code) ? "Yes" : "No",
      Description: r.description ?? "",
    };
  });
}

/**
 * Format a number per the chosen `DecimalFormat`. Pure helper —
 * unit-tested. Reserved for the upcoming Balance column.
 */
export function formatDecimal(n: number, format: DecimalFormat): string {
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  const negative = n < 0;
  // 2-decimal precision is the convention for accounting CSVs.
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  if (format === "1234567.89") {
    return `${negative ? "-" : ""}${intPart}.${decPart}`;
  }
  if (format === "1,234,567.89") {
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${negative ? "-" : ""}${grouped}.${decPart}`;
  }
  // 1.234.567,89
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped},${decPart}`;
}

export function buildCoaCsv(rows: CoaCsvRow[]): string {
  return toCsv(
    buildCoaCsvRows(rows),
    COA_CSV_COLUMNS as unknown as string[]
  );
}
