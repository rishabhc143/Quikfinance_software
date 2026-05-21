/**
 * DOC-D2.2: HDFC Bank statement parser.
 *
 * HDFC's e-statement (2026 default template) emits text in the shape:
 *
 *   HDFC BANK
 *   Statement of Account
 *   Account Number: 50100123456789
 *   Statement Period: 01/04/2026 to 30/04/2026
 *
 *   Date  Narration  Chq./Ref.No.  Value Dt  Withdrawal Amt.  Deposit Amt.  Closing Balance
 *   01/04/26  SALARY-NEFT  REF12345  01/04/26    50,000.00  1,25,000.00
 *   05/04/26  ATM WDL  ATM999  05/04/26  5,000.00      1,20,000.00
 *   ...
 *   OPENING BALANCE  75,000.00
 *   CLOSING BALANCE  1,25,450.00
 *
 * pdf-parse collapses the columns into whitespace-separated tokens
 * per visual line. The parser scans line-by-line:
 *   1. Skip until we see a date-led row (looks like a transaction).
 *   2. Pull date / amounts from the trailing-end of the line (amounts
 *      are always the last 1-3 tokens before line end).
 *   3. Description is everything between the date and the first
 *      amount token.
 *   4. Detect debit vs credit by which amount column is empty (the
 *      pattern always shows withdrawal OR deposit, never both).
 *
 * Real bank statements have lots of noise (page footers, address
 * blocks, "Page X of Y" lines). We rely on the date prefix as the
 * "this is a transaction" signal and tolerate gaps gracefully.
 */

import {
  parseInrAmount,
  parseInrDate,
  type ParsedBankStatement,
  type BankTransactionRow,
} from "./bank-statement-types";

const DATE_RE = /^(\d{1,2}\/\d{1,2}\/\d{2,4})\b/;

/**
 * Pluck the last N "money-like" tokens from a line. We treat any
 * token that parses to a finite number via `parseInrAmount` as money.
 * Returns the tokens in order from left to right (so the caller can
 * map them to the Withdrawal / Deposit / Balance columns).
 */
function trailingAmountTokens(line: string): string[] {
  // Collapse "1,234.56 Cr" / "1,234.56 Dr" into single tokens before
  // splitting — pdf-parse outputs the suffix as a separate token.
  const collapsed = line
    .trim()
    .replace(/(\d[\d,.\-()]*)\s+(Dr|Cr)\b/gi, "$1$2");
  const parts = collapsed.split(/\s+/);
  const amounts: string[] = [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const t = parts[i];
    // An amount token must contain at least one digit and only
    // amount-like chars (optionally followed by Dr/Cr suffix without
    // a space since we collapsed above).
    if (!/^[\d,.\-()]+(?:Dr|Cr)?$/i.test(t)) break;
    if (!/\d/.test(t)) break;
    amounts.unshift(t);
    if (amounts.length >= 3) break;
  }
  return amounts;
}

/** Extract `Account Number` / `A/C No` value from the statement header. */
function findAccountNumber(text: string): string | undefined {
  const m = text.match(/(?:Account Number|A\/C No|Account No)\s*[:\-]?\s*(\d[\d\-\s]{6,})/i);
  if (!m) return undefined;
  return m[1].replace(/[\s\-]/g, "");
}

/** Pull the statement period from a "Statement Period: from to" line. */
function findPeriod(text: string): ParsedBankStatement["period"] {
  const m = text.match(/Statement Period\s*[:\-]?\s*(\S+)\s+to\s+(\S+)/i);
  if (!m) return undefined;
  const from = parseInrDate(m[1]);
  const to = parseInrDate(m[2]);
  if (!from || !to) return undefined;
  return { from, to };
}

/**
 * "OPENING BALANCE 75,000.00" / "Opening Balance: 75,000.00".
 *
 * Anchored to lines that have an actual amount on the same line —
 * NOT followed only by a newline. Without that guard, "Closing Balance"
 * appearing as the last column header would steal the digit prefix of
 * the next transaction row ("01/04/2026 ..." → "1").
 */
function findOpeningBalance(text: string): number | undefined {
  const m = text.match(/Opening Balance\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/i);
  if (!m) return undefined;
  const n = parseInrAmount(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function findClosingBalance(text: string): number | undefined {
  // Scan all matches and pick the one with the largest amount — the
  // summary line at the end of the statement carries the real balance;
  // the column header (zero digits captured) loses. If the only match
  // has digits it wins by default.
  const re = /Closing Balance\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/gi;
  let bestRaw: string | undefined;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseInrAmount(m[1]);
    if (!Number.isFinite(n)) continue;
    if (!bestRaw || n > (parseInrAmount(bestRaw) || 0)) {
      bestRaw = m[1];
    }
  }
  if (!bestRaw) return undefined;
  const num = parseInrAmount(bestRaw);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Parse one HDFC transaction line. Returns null when the line doesn't
 * look like a transaction (e.g. page footer, summary row).
 *
 * Strategy:
 *   1. Line starts with `dd/MM/yy` or `dd/MM/yyyy` date.
 *   2. The last 1-3 tokens are amounts.
 *   3. Description is the middle slice.
 *   4. Two amounts → withdrawal + balance OR deposit + balance.
 *      Three amounts → withdrawal + deposit + balance (rare; one is
 *      usually 0).
 */
function parseHdfcLine(line: string): BankTransactionRow | null {
  const dateMatch = line.match(DATE_RE);
  if (!dateMatch) return null;
  const date = parseInrDate(dateMatch[1]);
  if (!date) return null;

  const amounts = trailingAmountTokens(line);
  if (amounts.length === 0) return null;

  // Description = everything between the date and the first amount
  // token. Find the position by removing the date prefix + trailing
  // amounts from the line and trimming.
  const withoutDate = line.slice(dateMatch[0].length).trim();
  let withoutAmounts = withoutDate;
  // Walk from the end, removing amount tokens.
  for (let i = 0; i < amounts.length; i++) {
    const idx = withoutAmounts.lastIndexOf(amounts[amounts.length - 1 - i]);
    if (idx < 0) break;
    withoutAmounts = withoutAmounts.slice(0, idx).trimEnd();
  }
  const description = withoutAmounts.trim();

  // Map amounts to columns.
  let debit: number | undefined;
  let credit: number | undefined;
  let balance: number | undefined;

  if (amounts.length === 1) {
    // Only balance — skip; not a real transaction line.
    return null;
  } else if (amounts.length === 2) {
    // [amount, balance] — we don't know debit vs credit from the
    // line alone. Heuristic: if balance went UP vs prior line we'll
    // call it credit; otherwise debit. But we don't have prior-line
    // context here. Best we can do: leave both fields and let the
    // caller (the run-through-pages pass) reconcile. For now,
    // detect via the "Dr"/"Cr" suffix on the first amount token if
    // present.
    const amtRaw = amounts[0];
    const balRaw = amounts[1];
    const amt = parseInrAmount(amtRaw);
    balance = parseInrAmount(balRaw);
    if (!Number.isFinite(amt)) return null;
    if (/cr/i.test(amtRaw)) credit = amt;
    else if (/dr/i.test(amtRaw)) debit = amt;
    else {
      // Without explicit Cr/Dr we default to debit (most statement
      // rows on HDFC summaries are withdrawals). D2.4 will refine
      // by reading the column header positions.
      debit = amt;
    }
  } else {
    // 3 amounts: [withdrawal, deposit, balance]. One of the first
    // two is always 0.
    const w = parseInrAmount(amounts[0]);
    const d = parseInrAmount(amounts[1]);
    balance = parseInrAmount(amounts[2]);
    if (Number.isFinite(w) && w > 0) debit = w;
    if (Number.isFinite(d) && d > 0) credit = d;
  }

  if (!Number.isFinite(balance)) balance = undefined;

  if (debit == null && credit == null) return null;

  return { date, description, debit, credit, balance };
}

/**
 * Top-level HDFC parser. Returns a ParsedBankStatement; rows may be
 * empty if the layout couldn't be parsed (we still return the bank
 * tag + opening/closing balances when those headers are present).
 */
export function parseHdfcStatement(text: string): ParsedBankStatement {
  const rows: BankTransactionRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parsed = parseHdfcLine(line);
    if (parsed) rows.push(parsed);
  }

  // After the first pass we can refine debit/credit using the
  // running balance: if balance went up vs the previous row, the
  // amount was a credit; if it went down, debit. This rescues rows
  // we tagged as `debit` by default when the source line was
  // ambiguous.
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];
    if (
      curr.balance != null &&
      prev.balance != null &&
      curr.debit != null &&
      curr.credit == null
    ) {
      const moved = curr.balance - prev.balance;
      if (Math.abs(moved - curr.debit) < 0.01) {
        // Balance went UP by the same amount we tagged as debit →
        // it's actually a credit. Swap.
        curr.credit = curr.debit;
        curr.debit = undefined;
      }
    }
  }

  return {
    bank: "HDFC",
    accountNumber: findAccountNumber(text),
    period: findPeriod(text),
    openingBalance: findOpeningBalance(text),
    closingBalance: findClosingBalance(text),
    rows,
  };
}
