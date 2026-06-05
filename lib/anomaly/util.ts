/**
 * CF-7 — Shared helpers for detector implementations.
 */

/**
 * Build a stable fingerprint for an alert. The orchestrator uses
 * this to detect "this anomaly is already OPEN" and skip insertion.
 *
 * Convention: `${detectorKey}:${sortedIds.join("|")}`. Sort the
 * source ids so a pair (A, B) collides with (B, A).
 */
export function fpKey(detectorKey: string, sortedIds: string[]): string {
  return `${detectorKey}:${[...sortedIds].sort().join("|")}`;
}

/**
 * Format a money value for inclusion in an alert description.
 * Uses Intl.NumberFormat with the org currency. Falls back to a
 * simple toFixed if Intl rejects the code.
 */
export function formatMoneyForDescription(
  amount: number,
  currency: string
): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
