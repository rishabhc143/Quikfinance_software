/**
 * DOC-D2.4: Generic Indian bank statement parser.
 *
 * Extracts the canonical HDFC-style "date-led row + trailing money
 * tokens" layout. Used by HDFC, Axis, Kotak, IDFC (and as the SBI
 * fallback). Each per-bank parser is now a thin wrapper that calls
 * `parseGenericBankStatement(text, bank)` with bank-specific
 * extension hooks if needed.
 *
 * The function emits a fully-formed `ParsedBankStatement` even when
 * row extraction returns empty — the consumer (index.ts) checks
 * `rows.length === 0` and treats that as "couldn't parse".
 */

import {
  parseInrAmount,
  parseInrDate,
  type ParsedBankStatement,
  type BankStatementSource,
  type BankTransactionRow,
} from "./bank-statement-types";

const DATE_RE = /^(\d{1,2}\/\d{1,2}\/\d{2,4})\b/;
const DATE_DASH_RE = /^(\d{1,2}-\d{1,2}-\d{2,4})\b/;
const DATE_NAMED_RE = /^(\d{1,2}\s+[A-Za-z]+\s+\d{2,4})\b/;

/** Collapse "1,234.56 Cr" / "1,234.56 Dr" to a single token. */
function collapseDrCr(line: string): string {
  return line.replace(/(\d[\d,.\-()]*)\s+(Dr|Cr)\b/gi, "$1$2");
}

function trailingAmountTokens(line: string): string[] {
  const parts = collapseDrCr(line.trim()).split(/\s+/);
  const amounts: string[] = [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const t = parts[i];
    if (!/^[\d,.\-()]+(?:Dr|Cr)?$/i.test(t)) break;
    if (!/\d/.test(t)) break;
    amounts.unshift(t);
    if (amounts.length >= 3) break;
  }
  return amounts;
}

/**
 * Try the 3 date prefixes in priority order. Returns the captured
 * raw date string + the length of the match (so the caller can slice
 * the description off).
 */
function matchDatePrefix(line: string): { raw: string; matchLen: number } | null {
  for (const re of [DATE_RE, DATE_DASH_RE, DATE_NAMED_RE]) {
    const m = line.match(re);
    if (m) return { raw: m[1], matchLen: m[0].length };
  }
  return null;
}

function findAccountNumber(text: string): string | undefined {
  const m = text.match(
    /(?:Account Number|A\/C No|Account No|Account #)\s*[:\-]?\s*(\d[\d\-\s]{6,})/i
  );
  if (!m) return undefined;
  return m[1].replace(/[\s\-]/g, "");
}

function findPeriod(text: string): ParsedBankStatement["period"] {
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
  const m = text.match(/Opening Balance\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/i);
  if (!m) return undefined;
  const n = parseInrAmount(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function findClosingBalance(text: string): number | undefined {
  const re = /Closing Balance\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/gi;
  let bestRaw: string | undefined;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseInrAmount(m[1]);
    if (!Number.isFinite(n)) continue;
    if (!bestRaw || n > (parseInrAmount(bestRaw) || 0)) bestRaw = m[1];
  }
  if (!bestRaw) return undefined;
  const num = parseInrAmount(bestRaw);
  return Number.isFinite(num) ? num : undefined;
}

function parseTransactionLine(line: string): BankTransactionRow | null {
  const dateMatch = matchDatePrefix(line);
  if (!dateMatch) return null;
  const date = parseInrDate(dateMatch.raw);
  if (!date) return null;

  const amounts = trailingAmountTokens(line);
  if (amounts.length === 0) return null;

  // Description = everything between the date prefix and the trailing
  // amounts.
  let working = collapseDrCr(line).slice(dateMatch.matchLen).trim();
  for (let i = 0; i < amounts.length; i++) {
    const tok = amounts[amounts.length - 1 - i];
    const idx = working.lastIndexOf(tok);
    if (idx < 0) break;
    working = working.slice(0, idx).trimEnd();
  }
  const description = working.trim();

  let debit: number | undefined;
  let credit: number | undefined;
  let balance: number | undefined;

  if (amounts.length === 1) return null;
  if (amounts.length === 2) {
    const amtRaw = amounts[0];
    const balRaw = amounts[1];
    const amt = parseInrAmount(amtRaw);
    balance = parseInrAmount(balRaw);
    if (!Number.isFinite(amt)) return null;
    if (/cr/i.test(amtRaw)) credit = amt;
    else if (/dr/i.test(amtRaw)) debit = amt;
    else debit = amt;
  } else {
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

/** Balance-roll reconciliation: rescue ambiguous Dr/Cr rows. */
function reconcileBalanceRoll(rows: BankTransactionRow[]): void {
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
        curr.credit = curr.debit;
        curr.debit = undefined;
      }
    }
  }
}

/**
 * Top-level generic parser. Returns a ParsedBankStatement with the
 * supplied bank tag + extracted rows.
 */
export function parseGenericBankStatement(
  text: string,
  bank: BankStatementSource
): ParsedBankStatement {
  const rows: BankTransactionRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parsed = parseTransactionLine(line);
    if (parsed) rows.push(parsed);
  }
  reconcileBalanceRoll(rows);

  return {
    bank,
    accountNumber: findAccountNumber(text),
    period: findPeriod(text),
    openingBalance: findOpeningBalance(text),
    closingBalance: findClosingBalance(text),
    rows,
  };
}
