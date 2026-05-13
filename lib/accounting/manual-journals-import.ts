/**
 * ACCT-A.4.b — Pure CSV parser + validator for Manual Journal
 * imports. The accountant uploads a CSV (typically a re-edit of
 * the A.4.a export) and we turn it into a list of `ParsedJournal`
 * rows ready to insert as DRAFTs, plus a list of `RowError`s for
 * rows we couldn't make sense of.
 *
 * No Prisma, no auth, no DB. The route handler loads the org's
 * accounts / contacts / projects into lookup maps and hands them
 * in; this file just does the data shaping + validation.
 *
 * Round-trip with A.4.a: the column header strings match
 * `MANUAL_JOURNAL_CSV_COLUMNS` exactly. Missing optional columns
 * are fine; missing required columns refuse the whole upload.
 */

import { validateManualJournalLines } from "@/lib/accounting/manual-journal-validation";

// ───────────────────────────── types ─────────────────────────────

export type RowError = {
  /** 1-indexed CSV row number (header = row 1). */
  row: number;
  /** Optional column name the error is about. */
  field?: string;
  message: string;
};

export type ParsedJournalLine = {
  accountId: string;
  contactId: string | null;
  projectId: string | null;
  debit: number;
  credit: number;
  description: string | null;
};

export type ReportingMethod =
  | "ACCRUAL_AND_CASH"
  | "ACCRUAL_ONLY"
  | "CASH_ONLY";

export type ParsedJournal = {
  /** User-supplied number from the CSV. Re-uniqued at insert time. */
  number: string;
  date: Date;
  referenceNumber: string | null;
  reportingMethod: ReportingMethod;
  currency: string | null;
  notes: string | null;
  lines: ParsedJournalLine[];
};

export type ParseInput = {
  csv: string;
  /** Upper-cased + trimmed Account Code → id. */
  accountsByCode: Map<string, { id: string }>;
  /** Lower-cased + trimmed Account Name → id. Fallback for blank code. */
  accountsByName: Map<string, { id: string }>;
  /** Lower-cased + trimmed Contact displayName → id. */
  contactsByName: Map<string, { id: string }>;
  /** Lower-cased + trimmed Project name → id. */
  projectsByName: Map<string, { id: string }>;
};

export type ParseResult = {
  journals: ParsedJournal[];
  errors: RowError[];
  /** Total CSV data rows we examined (not counting header). */
  totalRows: number;
};

// ───────────────────────────── tunables ─────────────────────────────

/** Hard cap so a paste-bomb can't OOM the server. */
export const MAX_IMPORT_ROWS = 5_000;

/** Column header names. Re-exported via MANUAL_JOURNAL_CSV_COLUMNS. */
const REQUIRED_HEADERS = [
  "Date",
  "Journal Number",
  "Account Code",
  "Debit",
  "Credit",
] as const;

const OPTIONAL_HEADERS = [
  "Reference Number",
  "Status",
  "Account Name",
  "Description",
  "Currency",
  "Reporting Method",
  "Contact",
  "Project",
  "Notes",
] as const;

const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];

const REPORTING_METHOD_LABELS: Record<string, ReportingMethod> = {
  "accrual and cash": "ACCRUAL_AND_CASH",
  "accrual only": "ACCRUAL_ONLY",
  "cash only": "CASH_ONLY",
  accrual_and_cash: "ACCRUAL_AND_CASH",
  accrual_only: "ACCRUAL_ONLY",
  cash_only: "CASH_ONLY",
};

// ───────────────────────────── RFC 4180 parser ─────────────────────────────

/**
 * Tiny RFC 4180 CSV parser. Handles:
 *   - Quoted fields (including with commas / newlines inside)
 *   - Escaped inner quotes (`""`)
 *   - Both `\r\n` and `\n` line endings
 *
 * Returns rows of string cells. Empty trailing newlines are
 * stripped. ~40 LoC, no deps — testable in isolation.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      cur.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      // Either \r\n or stray \r — treat as a row terminator.
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
      i++;
      if (text[i] === "\n") i++;
      continue;
    }
    if (ch === "\n") {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Flush the last field if the file didn't end with a newline.
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  // Drop fully-empty trailing rows.
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === "")) {
    rows.pop();
  }
  return rows;
}

// ───────────────────────────── header validation ─────────────────────────────

/**
 * Returns a column-name → 0-based-index map if the header row
 * contains all required columns, or a list of error messages if
 * it doesn't. Unknown columns are accepted but ignored (forward
 * compat). Case-insensitive on the header strings.
 */
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

// ───────────────────────────── per-cell parsers ─────────────────────────────

/** Pluck a cell by header name; returns "" if column wasn't in the header. */
function cell(
  row: string[],
  index: Map<string, number>,
  name: string
): string {
  const i = index.get(name);
  if (i === undefined) return "";
  return (row[i] ?? "").trim();
}

/** Strict `yyyy-mm-dd` → UTC Date; null on failure. */
export function parseIsoDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

/** Strip thousands-separators + currency glyphs; "" → 0. */
export function parseAmount(s: string): number | null {
  if (s === "") return 0;
  const cleaned = s.replace(/[,₹$€£\s]/g, "");
  if (cleaned === "") return 0;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function parseReportingMethod(s: string): ReportingMethod {
  const key = s.toLowerCase().trim();
  return REPORTING_METHOD_LABELS[key] ?? "ACCRUAL_AND_CASH";
}

// ───────────────────────────── main parser ─────────────────────────────

/**
 * The big function. Returns parsed journals + row errors.
 * Bad rows are kept out of the journals list; their errors are
 * collected by row index so the wizard can show them inline.
 *
 * Grouping: rows with the same `Journal Number` (case-sensitive,
 * trimmed) coalesce into one journal. The first row's header
 * fields win — subsequent rows can vary the line-level fields
 * (account / debit / credit / contact / project / description).
 */
export function parseManualJournalsCsv(input: ParseInput): ParseResult {
  const { csv } = input;
  const errors: RowError[] = [];

  const raw = parseCsv(csv);
  if (raw.length === 0) {
    return {
      journals: [],
      errors: [{ row: 0, message: "The file appears to be empty." }],
      totalRows: 0,
    };
  }
  if (raw.length - 1 > MAX_IMPORT_ROWS) {
    return {
      journals: [],
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
      journals: [],
      errors: headerCheck.errors.map((m) => ({ row: 1, message: m })),
      totalRows: raw.length - 1,
    };
  }
  const index = headerCheck.index;
  const dataRows = raw.slice(1);

  // Group rows by Journal Number while parsing each line.
  type Acc = {
    rowIndex: number; // 1-based csv row of the first row
    header: ParsedJournal;
    lineErrors: RowError[];
  };
  const acc = new Map<string, Acc>();
  const orderedNumbers: string[] = [];

  dataRows.forEach((row, idx) => {
    const csvRow = idx + 2; // 1-based; +1 for header

    // Skip wholly-empty rows silently.
    if (row.every((c) => c.trim() === "")) return;

    const number = cell(row, index, "Journal Number");
    if (!number) {
      errors.push({
        row: csvRow,
        field: "Journal Number",
        message: "Journal Number is required",
      });
      return;
    }

    const dateStr = cell(row, index, "Date");
    const date = parseIsoDate(dateStr);
    if (!date) {
      errors.push({
        row: csvRow,
        field: "Date",
        message: `Bad date "${dateStr}" — expected yyyy-mm-dd`,
      });
      return;
    }

    // Resolve account: prefer Code, fall back to Name.
    const code = cell(row, index, "Account Code").toUpperCase();
    const name = cell(row, index, "Account Name").toLowerCase();
    let accountId: string | null = null;
    if (code) accountId = input.accountsByCode.get(code)?.id ?? null;
    if (!accountId && name) accountId = input.accountsByName.get(name)?.id ?? null;
    if (!accountId) {
      errors.push({
        row: csvRow,
        field: "Account Code",
        message: code
          ? `Unknown account code "${code}"`
          : name
            ? `Unknown account name "${name}"`
            : "Account Code or Account Name is required",
      });
      return;
    }

    const debit = parseAmount(cell(row, index, "Debit"));
    const credit = parseAmount(cell(row, index, "Credit"));
    if (debit === null) {
      errors.push({
        row: csvRow,
        field: "Debit",
        message: `Bad number in Debit column`,
      });
      return;
    }
    if (credit === null) {
      errors.push({
        row: csvRow,
        field: "Credit",
        message: `Bad number in Credit column`,
      });
      return;
    }

    // Resolve optional dimensions. Unknown name = row error (NOT
    // silently dropped) so the accountant catches typos.
    const contactName = cell(row, index, "Contact").toLowerCase();
    let contactId: string | null = null;
    if (contactName) {
      contactId = input.contactsByName.get(contactName)?.id ?? null;
      if (!contactId) {
        errors.push({
          row: csvRow,
          field: "Contact",
          message: `Unknown contact "${contactName}"`,
        });
        return;
      }
    }
    const projectName = cell(row, index, "Project").toLowerCase();
    let projectId: string | null = null;
    if (projectName) {
      projectId = input.projectsByName.get(projectName)?.id ?? null;
      if (!projectId) {
        errors.push({
          row: csvRow,
          field: "Project",
          message: `Unknown project "${projectName}"`,
        });
        return;
      }
    }

    const line: ParsedJournalLine = {
      accountId,
      contactId,
      projectId,
      debit,
      credit,
      description: cell(row, index, "Description") || null,
    };

    if (!acc.has(number)) {
      orderedNumbers.push(number);
      acc.set(number, {
        rowIndex: csvRow,
        header: {
          number,
          date,
          referenceNumber: cell(row, index, "Reference Number") || null,
          reportingMethod: parseReportingMethod(
            cell(row, index, "Reporting Method")
          ),
          currency: cell(row, index, "Currency") || null,
          notes: cell(row, index, "Notes") || null,
          lines: [line],
        },
        lineErrors: [],
      });
    } else {
      acc.get(number)!.header.lines.push(line);
    }
  });

  // Per-journal balance check. Drop bad journals into the error list.
  const journals: ParsedJournal[] = [];
  for (const number of orderedNumbers) {
    const entry = acc.get(number)!;
    const msg = validateManualJournalLines(entry.header.lines);
    if (msg) {
      errors.push({
        row: entry.rowIndex,
        field: "Journal Number",
        message: `Journal "${number}": ${msg}`,
      });
      continue;
    }
    journals.push(entry.header);
  }

  return { journals, errors, totalRows: dataRows.length };
}
