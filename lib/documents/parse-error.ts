/**
 * CRIT-4 audit follow-up (Site 3).
 *
 * When the bank-statement parser fallback chain (heuristic → LLM)
 * produces no rows for a document classified as BANK_STATEMENT,
 * we want the drawer to tell the user "we tried and couldn't"
 * rather than silently rendering an empty table that looks like
 * "no transactions in this period."
 *
 * The signal is stored inside `Document.extractedFields._meta.parseError`.
 * No schema migration is required — extractedFields is JSONB.
 *
 * This helper centralises the sentinel construction so the four
 * action sites (upload / bank-statements-upload / password-retry /
 * llm-retry) all produce the same shape + message.
 */

import type { ParsedBankStatement } from "./parsers";

/**
 * Build a parsed-bank-statement value that carries a parseError but
 * no rows. The drawer's `BankStatementTransactionsPanel` reads
 * `_meta.parseError` and renders a hint banner in place of the
 * transactions table.
 */
export function buildBankStatementParseError(
  reason: string
): ParsedBankStatement {
  return {
    bank: "UNKNOWN",
    rows: [],
    _meta: { parserSource: "heuristic", parseError: reason },
  };
}

/**
 * The default reason copy. We pick one based on whether the
 * deployment has the AI fallback configured — the suggested
 * remediation differs (enable AI vs try a CSV export).
 */
export function defaultParseErrorReason(llmEnabled: boolean): string {
  if (llmEnabled) {
    return "Smart Capture couldn't extract rows from this layout, and the AI fallback also returned nothing useful. Try uploading a CSV export from your bank instead, or upload a clearer scan.";
  }
  return "Smart Capture couldn't extract rows from this layout. Try enabling the AI fallback (set ANTHROPIC_API_KEY) or upload a CSV export from your bank.";
}
