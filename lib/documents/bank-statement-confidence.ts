/**
 * DOC-D4.2: Confidence scoring for parsed bank statements.
 *
 * Pure function. Takes a `ParsedBankStatement` and returns a coarse
 * `{ score, level, signals }` triple so the UI can surface trust
 * cues to the user ("High confidence" / "Medium" / "Low — review
 * carefully").
 *
 * Signals fed into the score:
 *   - Row count (more rows = more likely a real statement)
 *   - Account number present
 *   - Statement period present
 *   - Opening + closing balances present
 *   - Balance reconciliation: does (sum credits - sum debits) match
 *     (closingBalance - openingBalance) within ₹1?
 *   - Bank tagged (not UNKNOWN)
 *
 * Score is 0-100. Bands:
 *   - high: ≥ 75
 *   - medium: 50-74
 *   - low: < 50
 *
 * Why this matters: D2.x parsers are heuristic regex/keyword scans.
 * They get bank statements wrong sometimes. A confidence indicator
 * tells the user when to trust the auto-extraction vs review the
 * rows before Import to Bank.
 */

import type { ParsedBankStatement } from "./parsers/bank-statement-types";

export type ConfidenceLevel = "high" | "medium" | "low";

export type ConfidenceResult = {
  score: number; // 0-100
  level: ConfidenceLevel;
  signals: string[];
};

const BALANCE_TOLERANCE = 1; // ₹1 tolerance for balance reconciliation

/**
 * Compute confidence score from a parsed bank statement. Returns
 * "low" for null / empty rows so the UI can hide the badge if it
 * wants.
 */
export function computeBankStatementConfidence(
  parsed: ParsedBankStatement | null | undefined
): ConfidenceResult {
  if (!parsed || !Array.isArray(parsed.rows)) {
    return { score: 0, level: "low", signals: ["No data parsed"] };
  }

  const rows = parsed.rows;
  const signals: string[] = [];
  let score = 30; // baseline

  // Row count signal: more rows = more likely a real statement.
  if (rows.length >= 20) {
    score += 25;
    signals.push(`${rows.length} transactions extracted`);
  } else if (rows.length >= 5) {
    score += 15;
    signals.push(`${rows.length} transactions extracted`);
  } else if (rows.length > 0) {
    score += 5;
    signals.push(`${rows.length} row${rows.length === 1 ? "" : "s"} extracted (few — review)`);
  } else {
    score -= 10;
    signals.push("No transactions extracted");
  }

  // Bank tagged?
  if (parsed.bank && parsed.bank !== "UNKNOWN") {
    score += 10;
    signals.push(`Bank detected: ${parsed.bank}`);
  }

  // Account number captured?
  if (parsed.accountNumber) {
    score += 8;
    signals.push("Account number captured");
  }

  // Statement period captured?
  if (parsed.period?.from && parsed.period?.to) {
    score += 7;
    signals.push("Statement period captured");
  }

  // Balance reconciliation — the strongest single signal.
  if (
    typeof parsed.openingBalance === "number" &&
    typeof parsed.closingBalance === "number" &&
    rows.length > 0
  ) {
    const sumCredit = rows.reduce(
      (acc, r) => acc + (typeof r.credit === "number" ? r.credit : 0),
      0
    );
    const sumDebit = rows.reduce(
      (acc, r) => acc + (typeof r.debit === "number" ? r.debit : 0),
      0
    );
    const expected = parsed.closingBalance - parsed.openingBalance;
    const actual = sumCredit - sumDebit;
    const diff = Math.abs(expected - actual);

    if (diff <= BALANCE_TOLERANCE) {
      score += 20;
      signals.push("Balance roll matches (parser confidence high)");
    } else {
      score -= 10;
      signals.push(
        `Balance roll mismatch: expected ${expected.toFixed(2)}, got ${actual.toFixed(2)} — review`
      );
    }
  } else if (rows.length > 0) {
    // We have rows but couldn't reconcile — note it but don't punish heavily.
    signals.push("Couldn't verify balance roll (opening/closing missing)");
  }

  // Clamp to 0-100.
  if (score < 0) score = 0;
  if (score > 100) score = 100;

  const level: ConfidenceLevel =
    score >= 75 ? "high" : score >= 50 ? "medium" : "low";

  return { score, level, signals };
}

/**
 * Helper for the UI badge — tailwind class pair for each level.
 */
export function confidenceBadgeClass(level: ConfidenceLevel): string {
  switch (level) {
    case "high":
      return "bg-emerald-100 text-emerald-800";
    case "medium":
      return "bg-amber-100 text-amber-800";
    case "low":
      return "bg-rose-100 text-rose-800";
  }
}

export function confidenceLabel(level: ConfidenceLevel): string {
  switch (level) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
      return "Low confidence — review";
  }
}
