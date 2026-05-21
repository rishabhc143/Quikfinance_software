/**
 * DOC-D2.2: ICICI Bank statement parser.
 *
 * ICICI's e-statement layout is similar in spirit to HDFC's but the
 * column order differs slightly:
 *
 *   ICICI BANK
 *   Account Statement
 *   Account Number: 1234567890
 *
 *   S.No  Value Date  Transaction Date  Cheque Number  Transaction Remarks  Withdrawal (Dr)  Deposit (Cr)  Balance
 *   1  01/04/2026  01/04/2026  -  SALARY  -  50,000.00  1,25,000.00
 *   2  05/04/2026  05/04/2026  -  ATM WDL  5,000.00  -  1,20,000.00
 *
 * pdf-parse merges the columns into space-separated tokens per line.
 * Key difference from HDFC:
 *   - Row may start with a serial number (1-3 digits) before the date
 *   - "Withdrawal" + "Deposit" columns can both show "-" when empty
 *
 * We share the helpers in `bank-statement-types.ts` for amount + date
 * parsing.
 */

import {
  parseInrAmount,
  parseInrDate,
  type ParsedBankStatement,
  type BankTransactionRow,
} from "./bank-statement-types";

const DATE_RE = /(\d{1,2}\/\d{1,2}\/\d{2,4})/;

/** Skip over a leading "S.No" token if present. */
function stripSerialNumber(line: string): string {
  return line.replace(/^\s*\d{1,4}\s+/, "");
}

function findAccountNumber(text: string): string | undefined {
  const m = text.match(/Account Number\s*[:\-]?\s*(\d[\d\-\s]{6,})/i);
  if (!m) return undefined;
  return m[1].replace(/[\s\-]/g, "");
}

function findPeriod(text: string): ParsedBankStatement["period"] {
  // Match "Statement Period: <from> to <to>" OR
  // "Statement from <from> to <to>" — ":" / "-" / "from" all
  // accepted between the prefix + dates.
  const m = text.match(
    /Statement(?:\s+Period)?\s*(?:[:\-]|from)?\s*(\S+)\s+to\s+(\S+)/i
  );
  if (!m) return undefined;
  const from = parseInrDate(m[1]);
  const to = parseInrDate(m[2]);
  if (!from || !to) return undefined;
  return { from, to };
}

function findOpeningBalance(text: string): number | undefined {
  const m = text.match(/Opening Balance\s*[:\-]?\s*([\d,.\-]+)/i);
  if (!m) return undefined;
  const n = parseInrAmount(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function findClosingBalance(text: string): number | undefined {
  const m = text.match(/Closing Balance\s*[:\-]?\s*([\d,.\-]+)/i);
  if (!m) return undefined;
  const n = parseInrAmount(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Pluck the last N amount-like tokens, treating "-" as "empty"
 * (which ICICI uses to mean "0" / "no value in this column").
 */
function trailingAmounts(line: string): Array<string | null> {
  const parts = line.trim().split(/\s+/);
  const tokens: Array<string | null> = [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const t = parts[i];
    if (t === "-") {
      tokens.unshift(null);
      if (tokens.length >= 3) break;
      continue;
    }
    if (!/^[\d,.\-()]+(?:\s*(?:Dr|Cr))?$/i.test(t)) break;
    if (!/\d/.test(t)) break;
    tokens.unshift(t);
    if (tokens.length >= 3) break;
  }
  return tokens;
}

function parseIciciLine(line: string): BankTransactionRow | null {
  const stripped = stripSerialNumber(line);
  const dateMatch = stripped.match(DATE_RE);
  if (!dateMatch) return null;
  const date = parseInrDate(dateMatch[1]);
  if (!date) return null;

  const amounts = trailingAmounts(stripped);
  // We need 3 trailing positions [withdrawal, deposit, balance] —
  // the layout always has those three columns even when some are "-".
  if (amounts.length < 3) return null;

  const wRaw = amounts[amounts.length - 3];
  const dRaw = amounts[amounts.length - 2];
  const bRaw = amounts[amounts.length - 1];

  const debit =
    wRaw !== null && Number.isFinite(parseInrAmount(wRaw))
      ? parseInrAmount(wRaw)
      : undefined;
  const credit =
    dRaw !== null && Number.isFinite(parseInrAmount(dRaw))
      ? parseInrAmount(dRaw)
      : undefined;
  const balance =
    bRaw !== null && Number.isFinite(parseInrAmount(bRaw))
      ? parseInrAmount(bRaw)
      : undefined;

  if (debit == null && credit == null) return null;

  // Description: between the second occurrence of a date (transaction
  // date) and the first amount column. Fall back to the slice between
  // the first date and the last 3 tokens.
  const partsAll = stripped.split(/\s+/);
  // Find the indexes of the last 3 amount/null positions.
  const sliceForDesc = partsAll.slice(0);
  // Drop the trailing 3 columns.
  sliceForDesc.splice(-3, 3);
  // Drop the leading dates (up to 2 of them) + a possible cheque
  // number marker. We just drop the first 3 tokens to be conservative
  // (Value Date, Transaction Date, Cheque#). If the layout omits the
  // cheque column we leave it in the description — small price.
  const description = sliceForDesc.slice(3).join(" ").trim() || sliceForDesc.join(" ");

  return { date, description, debit, credit, balance };
}

export function parseIciciStatement(text: string): ParsedBankStatement {
  const rows: BankTransactionRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parsed = parseIciciLine(line);
    if (parsed) rows.push(parsed);
  }
  return {
    bank: "ICICI",
    accountNumber: findAccountNumber(text),
    period: findPeriod(text),
    openingBalance: findOpeningBalance(text),
    closingBalance: findClosingBalance(text),
    rows,
  };
}
