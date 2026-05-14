import type { AccountType } from "@prisma/client";
import { parseCsv } from "@/lib/accounting/manual-journals-import";
import {
  COA_SUBTYPES_BY_TYPE,
  isValidSubTypeForType,
} from "@/lib/accounting/coa-subtypes";

/**
 * ACCT-E.4 — Pure CSV parser for Chart of Accounts import.
 *
 * Reads the same column layout the export writes:
 *   Account Code · Account Name · Account Type · Sub-type ·
 *   Parent Account · Status · System · Description
 *
 * Required columns: `Account Name`, `Account Type`. Everything
 * else is optional. Unknown columns are tolerated.
 *
 * Returns parsed rows + per-row errors so the wizard can show
 * "n valid rows · m errors" before committing.
 *
 * No Prisma, no DB. The action layer handles the actual inserts.
 */

export type RowError = {
  row: number;
  field?: string;
  message: string;
};

export type ParsedCoaRow = {
  code: string | null;
  name: string;
  type: AccountType;
  subType: string | null;
  description: string | null;
  isActive: boolean;
};

export type ParseResult = {
  rows: ParsedCoaRow[];
  errors: RowError[];
  totalRows: number;
};

const REQUIRED_HEADERS = ["Account Name", "Account Type"] as const;
const OPTIONAL_HEADERS = [
  "Account Code",
  "Sub-type",
  "Parent Account",
  "Status",
  "System",
  "Description",
] as const;
const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];

const MAX_IMPORT_ROWS = 5_000;

const TYPE_BY_LABEL: Record<string, AccountType> = {
  asset: "ASSET",
  liability: "LIABILITY",
  equity: "EQUITY",
  income: "INCOME",
  expense: "EXPENSE",
  "cost of goods sold": "COST_OF_GOODS_SOLD",
  "other income": "OTHER_INCOME",
  "other expense": "OTHER_EXPENSE",
};

export function indexHeaders(
  headerCells: string[]
): { ok: true; index: Map<string, number> } | { ok: false; errors: string[] } {
  const normalized = headerCells.map((c) => c.trim());
  const lcMap = new Map<string, number>();
  normalized.forEach((c, i) => {
    if (!lcMap.has(c.toLowerCase())) lcMap.set(c.toLowerCase(), i);
  });
  const errors: string[] = [];
  const index = new Map<string, number>();
  for (const want of ALL_HEADERS) {
    const found = lcMap.get(want.toLowerCase());
    if (found !== undefined) index.set(want, found);
  }
  for (const required of REQUIRED_HEADERS) {
    if (!index.has(required)) {
      errors.push(`Missing required column: "${required}"`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, index };
}

function cell(
  row: string[],
  index: Map<string, number>,
  name: string
): string {
  const i = index.get(name);
  if (i === undefined) return "";
  return (row[i] ?? "").trim();
}

/** Map a free-text Account Type label to our enum. */
export function parseAccountType(s: string): AccountType | null {
  const k = s.trim().toLowerCase();
  return TYPE_BY_LABEL[k] ?? null;
}

/**
 * Map a row's Sub-type field against the picked AccountType's
 * allowed set. Returns the sub-type if valid, null if blank, or
 * undefined if it's set but not valid for the type.
 */
function pickSubType(
  type: AccountType,
  raw: string
): string | null | undefined {
  if (!raw) return null;
  const allowed = COA_SUBTYPES_BY_TYPE[type];
  // Case-insensitive match against the allowed list.
  const found = allowed.find(
    (s) => s.toLowerCase() === raw.trim().toLowerCase()
  );
  if (!found) return undefined; // signals invalid
  return found;
}

export function parseCoaCsv(csv: string): ParseResult {
  const errors: RowError[] = [];
  const raw = parseCsv(csv);
  if (raw.length === 0) {
    return {
      rows: [],
      errors: [{ row: 0, message: "The file appears to be empty." }],
      totalRows: 0,
    };
  }
  if (raw.length - 1 > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          message: `Too many rows (${raw.length - 1}). Maximum is ${MAX_IMPORT_ROWS}.`,
        },
      ],
      totalRows: raw.length - 1,
    };
  }

  const headerCheck = indexHeaders(raw[0]);
  if (!headerCheck.ok) {
    return {
      rows: [],
      errors: headerCheck.errors.map((m) => ({ row: 1, message: m })),
      totalRows: raw.length - 1,
    };
  }
  const index = headerCheck.index;
  const dataRows = raw.slice(1);
  const out: ParsedCoaRow[] = [];
  // Track seen (name) so a single CSV can't repeat the same name.
  const seenLower = new Set<string>();

  dataRows.forEach((row, idx) => {
    const csvRow = idx + 2;
    if (row.every((c) => c.trim() === "")) return;

    const name = cell(row, index, "Account Name");
    if (!name) {
      errors.push({
        row: csvRow,
        field: "Account Name",
        message: "Account Name is required",
      });
      return;
    }

    const typeRaw = cell(row, index, "Account Type");
    const type = parseAccountType(typeRaw);
    if (!type) {
      errors.push({
        row: csvRow,
        field: "Account Type",
        message: `Unknown account type "${typeRaw}". Expected one of: Asset, Liability, Equity, Income, Expense, Cost of Goods Sold, Other Income, Other Expense.`,
      });
      return;
    }

    const subTypeRaw = cell(row, index, "Sub-type");
    const subType = pickSubType(type, subTypeRaw);
    if (subType === undefined) {
      errors.push({
        row: csvRow,
        field: "Sub-type",
        message: `Sub-type "${subTypeRaw}" isn't valid for ${type}. Valid: ${COA_SUBTYPES_BY_TYPE[type].join(", ")}.`,
      });
      return;
    }
    // Defensive — should never happen given pickSubType returns
    // only allowed values, but pin the invariant.
    if (subType !== null && !isValidSubTypeForType(type, subType)) {
      errors.push({
        row: csvRow,
        field: "Sub-type",
        message: `Sub-type "${subType}" rejected by validator.`,
      });
      return;
    }

    const code = cell(row, index, "Account Code") || null;
    if (code?.startsWith("SYS-")) {
      errors.push({
        row: csvRow,
        field: "Account Code",
        message: `Reserved system-account code prefix "SYS-" can't be imported.`,
      });
      return;
    }

    const description = cell(row, index, "Description") || null;
    const statusRaw = cell(row, index, "Status").toLowerCase();
    const isActive =
      statusRaw === "" || statusRaw === "active" || statusRaw === "yes";

    const nameLower = name.trim().toLowerCase();
    if (seenLower.has(nameLower)) {
      errors.push({
        row: csvRow,
        field: "Account Name",
        message: `Duplicate name "${name}" in the file.`,
      });
      return;
    }
    seenLower.add(nameLower);

    out.push({ code, name, type, subType, description, isActive });
  });

  return { rows: out, errors, totalRows: dataRows.length };
}
