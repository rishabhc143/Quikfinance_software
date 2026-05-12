/**
 * BNK-A — CSV import helpers for bank statements.
 *
 * Three layers of complexity Zoho's column-mapping wizard handles, in
 * order of appearance in the wizard UI:
 *
 *   1. Header detection — find which CSV columns are Date, Description,
 *      Reference, Amount (and how Amount is encoded — see #2).
 *
 *   2. Amount column type — three variants Zoho documents:
 *      - DOUBLE             — separate Debit + Credit columns; one is always 0
 *      - SINGLE_WITH_TYPE   — one Amount column + a Type column (DR/CR or +/−)
 *      - SINGLE_NEGATIVE    — one Amount column where negatives are
 *                             withdrawals
 *      Different banks export different formats; we auto-detect on the
 *      first non-header rows and let the user override.
 *
 *   3. Row normalization — turn one CSV row into a canonical
 *      { date, description, reference, amount, type } shape ready for
 *      duplicate detection + BankTransaction insertion.
 *
 * Pure functions only — DB writes happen in the server action layer.
 * Reuses the parseImportDate helper from the Purchases import-helpers so
 * date parsing behaves identically across the app.
 */

import { parseImportDate } from "@/lib/purchases/import-helpers";

export type AmountColumnType =
  | "DOUBLE"
  | "SINGLE_WITH_TYPE"
  | "SINGLE_NEGATIVE";

export type CsvColumnMap = {
  date: string;
  description?: string;
  reference?: string;
  amountColumnType: AmountColumnType;
  // DOUBLE — both keys required
  debit?: string;
  credit?: string;
  // SINGLE_WITH_TYPE — both keys required
  amount?: string;
  amountType?: string;
};

export type ParsedRow = {
  date: Date;
  description: string | null;
  reference: string | null;
  amount: number; // Always positive — direction lives in `type`
  type: "DEBIT" | "CREDIT";
};

export type RowError = {
  rowNumber: number;
  message: string;
};

export type ParseResult = {
  rows: ParsedRow[];
  errors: RowError[];
};

/** Header-name candidates per canonical field. Lowercase, space-stripped. */
const HEADER_CANDIDATES = {
  date: [
    "date",
    "txndate",
    "transactiondate",
    "valuedate",
    "postingdate",
    "posteddate",
  ],
  description: [
    "description",
    "narration",
    "particulars",
    "details",
    "memo",
    "remarks",
  ],
  reference: [
    "reference",
    "referenceno",
    "referencenumber",
    "refno",
    "chequeno",
    "chqno",
    "transactionid",
    "txnid",
  ],
  debit: ["debit", "withdrawal", "withdrawals", "dr"],
  credit: ["credit", "deposit", "deposits", "cr"],
  amount: ["amount", "txnamount", "transactionamount", "value"],
  amountType: ["type", "drcr", "transactiontype", "txntype"],
} as const;

function normaliseHeader(s: string): string {
  return s.toLowerCase().replace(/[\s_\-/().]/g, "");
}

/**
 * Best-guess column mapping from a list of CSV headers. Returns a
 * partial map — the wizard's preview step shows unmapped fields so the
 * user can override. The Amount-column type is also detected here based
 * on which Debit/Credit/Amount columns are present.
 */
export function autoDetectColumnMap(
  headers: string[]
): Partial<CsvColumnMap> {
  const normalised = headers.map(normaliseHeader);
  const findOne = (candidates: readonly string[]): string | undefined => {
    for (const [i, h] of normalised.entries()) {
      if (candidates.includes(h)) return headers[i];
    }
    return undefined;
  };

  const date = findOne(HEADER_CANDIDATES.date);
  const description = findOne(HEADER_CANDIDATES.description);
  const reference = findOne(HEADER_CANDIDATES.reference);
  const debit = findOne(HEADER_CANDIDATES.debit);
  const credit = findOne(HEADER_CANDIDATES.credit);
  const amount = findOne(HEADER_CANDIDATES.amount);
  const amountType = findOne(HEADER_CANDIDATES.amountType);

  // Pick the Amount column type:
  // - If both Debit + Credit columns exist → DOUBLE
  // - If a single Amount column + an explicit type column → SINGLE_WITH_TYPE
  // - If a single Amount column with no type column → SINGLE_NEGATIVE
  //   (assumes negatives are withdrawals)
  let amountColumnType: AmountColumnType;
  if (debit && credit) {
    amountColumnType = "DOUBLE";
  } else if (amount && amountType) {
    amountColumnType = "SINGLE_WITH_TYPE";
  } else {
    amountColumnType = "SINGLE_NEGATIVE";
  }

  return {
    date: date ?? "",
    description,
    reference,
    amountColumnType,
    debit,
    credit,
    amount,
    amountType,
  };
}

function toNumberOrNull(raw: string | undefined): number | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  // Strip currency symbols, thousand separators
  const cleaned = t.replace(/[,₹$£€\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseTypeMarker(
  raw: string | undefined
): "DEBIT" | "CREDIT" | null {
  if (raw == null) return null;
  const t = raw.trim().toUpperCase();
  if (!t) return null;
  if (["DR", "DEBIT", "D", "-", "WITHDRAWAL", "WD"].includes(t)) return "DEBIT";
  if (["CR", "CREDIT", "C", "+", "DEPOSIT", "DP"].includes(t)) return "CREDIT";
  return null;
}

/**
 * Apply a column map to one CSV row. Returns either a ParsedRow or a
 * descriptive error string explaining what went wrong (the wizard surfaces
 * these per-row in the preview).
 */
export function parseRow(
  row: Record<string, string>,
  map: CsvColumnMap
): ParsedRow | { error: string } {
  const dateRaw = row[map.date];
  if (!dateRaw) return { error: "date is empty" };
  const date = parseImportDate(dateRaw);
  if (!date) return { error: `date "${dateRaw}" not recognised` };

  let amount: number;
  let type: "DEBIT" | "CREDIT";

  if (map.amountColumnType === "DOUBLE") {
    const debit = toNumberOrNull(row[map.debit ?? ""]);
    const credit = toNumberOrNull(row[map.credit ?? ""]);
    if (debit == null && credit == null) {
      return { error: "both Debit and Credit columns are empty" };
    }
    if ((debit ?? 0) > 0) {
      amount = Math.abs(debit ?? 0);
      type = "DEBIT";
    } else if ((credit ?? 0) > 0) {
      amount = Math.abs(credit ?? 0);
      type = "CREDIT";
    } else {
      return { error: "Debit and Credit are both zero" };
    }
  } else if (map.amountColumnType === "SINGLE_WITH_TYPE") {
    const amt = toNumberOrNull(row[map.amount ?? ""]);
    const marker = parseTypeMarker(row[map.amountType ?? ""]);
    if (amt == null) return { error: "Amount is empty or not a number" };
    if (marker == null) {
      return { error: "Type column is empty or unrecognised (need DR/CR)" };
    }
    amount = Math.abs(amt);
    type = marker;
  } else {
    // SINGLE_NEGATIVE
    const amt = toNumberOrNull(row[map.amount ?? ""]);
    if (amt == null) return { error: "Amount is empty or not a number" };
    amount = Math.abs(amt);
    type = amt < 0 ? "DEBIT" : "CREDIT";
  }

  return {
    date,
    description: row[map.description ?? ""]?.trim() || null,
    reference: row[map.reference ?? ""]?.trim() || null,
    amount,
    type,
  };
}

/**
 * Parse a full CSV (array of header-keyed rows) against a column map.
 * Collects per-row errors so the wizard's preview can highlight which
 * lines need attention before commit.
 */
export function parseCsv(
  rows: Record<string, string>[],
  map: CsvColumnMap
): ParseResult {
  const out: ParseResult = { rows: [], errors: [] };
  rows.forEach((row, i) => {
    const result = parseRow(row, map);
    if ("error" in result) {
      // +2 because user-facing row numbers count from 1 and the header is row 1
      out.errors.push({ rowNumber: i + 2, message: result.error });
    } else {
      out.rows.push(result);
    }
  });
  return out;
}
