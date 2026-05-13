/**
 * BNK-F — Reconciliation summary math.
 *
 * Pure functions: take the opening balance + the period's transactions +
 * the user's chosen closing balance, return the running cleared totals
 * and the Difference (zero when the books balance).
 *
 *   netCleared = openingBalance + Σ(cleared CREDIT) − Σ(cleared DEBIT)
 *   difference = netCleared − closingBalance
 *
 * "balanced" means |difference| ≤ 0.005 (half-paisa tolerance). The
 * comparison is intentionally loose to absorb floating-point noise when
 * many small decimals are summed.
 *
 * The caller (server action / client UI) is responsible for filtering
 * to the period's eligible transactions and for marking which are
 * cleared. The helper is direction-only — it doesn't care whether a
 * row is "matched" or "categorised", it only sums signed amounts.
 */

export type ReconciliationLine = {
  id: string;
  /** Always positive — the sign is encoded in `type`. */
  amount: number;
  type: "CREDIT" | "DEBIT";
  /** True when the user has ticked the Cleared checkbox. */
  cleared: boolean;
};

export type ReconciliationSummary = {
  /** Sum of `amount` for cleared CREDIT rows. */
  clearedIn: number;
  /** Sum of `amount` for cleared DEBIT rows. */
  clearedOut: number;
  /** openingBalance + clearedIn − clearedOut. */
  netCleared: number;
  /** netCleared − closingBalance. Target: 0. */
  difference: number;
  /** True when |difference| ≤ 0.005. */
  balanced: boolean;
  /** Convenience for the UI: counts of cleared / uncleared rows. */
  clearedCount: number;
  unclearedCount: number;
};

const TOLERANCE = 0.005;

export function computeSummary(input: {
  openingBalance: number;
  closingBalance: number;
  lines: ReconciliationLine[];
}): ReconciliationSummary {
  let clearedIn = 0;
  let clearedOut = 0;
  let clearedCount = 0;
  let unclearedCount = 0;
  for (const line of input.lines) {
    if (!line.cleared) {
      unclearedCount += 1;
      continue;
    }
    clearedCount += 1;
    const amt = Math.abs(line.amount);
    if (line.type === "CREDIT") clearedIn += amt;
    else clearedOut += amt;
  }
  const netCleared = input.openingBalance + clearedIn - clearedOut;
  const difference = netCleared - input.closingBalance;
  return {
    clearedIn,
    clearedOut,
    netCleared,
    difference,
    balanced: Math.abs(difference) <= TOLERANCE,
    clearedCount,
    unclearedCount,
  };
}
