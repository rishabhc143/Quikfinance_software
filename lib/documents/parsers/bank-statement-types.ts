/**
 * DOC-D2.2: Shared output shape for bank-statement parsers.
 *
 * Stored as JSON in `Document.extractedFields` and consumed by the
 * preview drawer's Transactions table + the `importStatementToBankAction`
 * server action that creates `BankTransaction` rows in the existing
 * Banking module.
 *
 * Amounts are stored as numbers (not Decimal) because JSONB doesn't
 * have a native decimal type — the server action converts to Prisma's
 * Decimal at insert time. Two decimal places is enough for INR (paise).
 */

export type BankStatementSource =
  | "HDFC"
  | "ICICI"
  | "AXIS"
  | "SBI"
  | "KOTAK"
  | "IDFC"
  | "UNKNOWN";

/**
 * One row from a parsed bank statement. Either `debit` or `credit`
 * is set (never both); `balance` is optional because not every layout
 * carries a running balance column.
 */
export type BankTransactionRow = {
  /** ISO date string (yyyy-MM-dd) for round-trip stability. */
  date: string;
  description: string;
  /** Money out of the account, in INR (positive number). */
  debit?: number;
  /** Money into the account, in INR (positive number). */
  credit?: number;
  /** Running balance after this row, when the statement layout
   *  carries one. */
  balance?: number;
  /** Optional mode tag from the statement (e.g. "NEFT", "UPI", "ATM"). */
  mode?: string;
  /** Optional reference / cheque number captured by some layouts. */
  reference?: string;
};

/**
 * Top-level parser result. Persisted in `Document.extractedFields`.
 *
 * `accountNumber` is captured when the layout exposes it; we mask all
 * but the last 4 digits before display (the lib stores the raw value;
 * the UI does the masking).
 */
export type ParsedBankStatement = {
  bank: BankStatementSource;
  accountNumber?: string;
  period?: { from: string; to: string }; // yyyy-MM-dd
  openingBalance?: number;
  closingBalance?: number;
  rows: BankTransactionRow[];
};

/**
 * Type guard for callers reading from JSONB. The shape stored on
 * Document.extractedFields could be anything when older PRs wrote
 * different schemas, so the consumer validates before using.
 */
export function isParsedBankStatement(
  value: unknown
): value is ParsedBankStatement {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.bank !== "string") return false;
  if (!Array.isArray(v.rows)) return false;
  return true;
}

/**
 * Indian rupee number parser. Handles:
 *   - "1,23,456.78"   (lakh grouping)
 *   - "1234.56"        (plain)
 *   - "(1,234)"        (parentheses for negatives — rare on bank statements)
 *   - "1,234.56 Dr"    (trailing Dr/Cr marker)
 *   - "1,234.56 CR"    (uppercase variant)
 *
 * Returns NaN if the input can't be parsed cleanly. Caller handles
 * NaN (treat as "skip this cell").
 */
export function parseInrAmount(raw: string | null | undefined): number {
  if (!raw) return NaN;
  const trimmed = raw.trim();
  if (!trimmed) return NaN;

  // Strip Dr/Cr suffix (case-insensitive). We don't use it to sign
  // the result because each parser knows its column context.
  const noSuffix = trimmed.replace(/\s*(?:dr|cr)\s*$/i, "");

  // Parentheses = negative.
  const isNeg = /^\(.+\)$/.test(noSuffix);
  const inner = isNeg ? noSuffix.slice(1, -1) : noSuffix;

  // Strip every comma (Indian + Western thousand groupings both
  // collapse cleanly — we just want digits, decimal point, and minus).
  const cleaned = inner.replace(/,/g, "").replace(/[^\d.\-]/g, "");
  if (!cleaned || cleaned === "." || cleaned === "-") return NaN;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return NaN;
  return isNeg ? -num : num;
}

/**
 * Parse common Indian bank statement date formats:
 *   - "01/04/2026"        (dd/MM/yyyy)
 *   - "01-04-2026"        (dd-MM-yyyy)
 *   - "01 Apr 2026"       (dd MMM yyyy)
 *   - "01 April 2026"
 *   - "2026-04-01"        (yyyy-MM-dd, rare but used by some banks)
 *
 * Returns an ISO yyyy-MM-dd string for round-trip safety, or null on
 * failure. We deliberately reject `MM/dd/yyyy` because no Indian bank
 * uses it — accepting it would mis-parse 03/04/2026 as 4th March
 * instead of 3rd April.
 */
export function parseInrDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // dd/MM/yyyy or dd-MM-yyyy
  const numeric = s.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/
  );
  if (numeric) {
    const dd = Number(numeric[1]);
    const mm = Number(numeric[2]);
    let yy = Number(numeric[3]);
    if (yy < 100) yy += yy >= 70 ? 1900 : 2000; // 2-digit year heuristic
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${yy.toString().padStart(4, "0")}-${mm
      .toString()
      .padStart(2, "0")}-${dd.toString().padStart(2, "0")}`;
  }

  // dd MMM yyyy / dd MMMM yyyy
  const monthMap: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };
  const named = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/);
  if (named) {
    const dd = Number(named[1]);
    const mm = monthMap[named[2].toLowerCase()];
    let yy = Number(named[3]);
    if (yy < 100) yy += yy >= 70 ? 1900 : 2000;
    if (!mm || dd < 1 || dd > 31) return null;
    return `${yy.toString().padStart(4, "0")}-${mm
      .toString()
      .padStart(2, "0")}-${dd.toString().padStart(2, "0")}`;
  }

  // yyyy-MM-dd already
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const yy = Number(iso[1]);
    const mm = Number(iso[2]);
    const dd = Number(iso[3]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${yy}-${iso[2]}-${iso[3]}`;
  }

  return null;
}
