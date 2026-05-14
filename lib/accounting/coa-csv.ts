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

export function buildCoaCsv(rows: CoaCsvRow[]): string {
  return toCsv(
    buildCoaCsvRows(rows),
    COA_CSV_COLUMNS as unknown as string[]
  );
}
