/**
 * ACCT-A — Pure validator for manual-journal lines. Lives in `lib/`
 * (not in the `"use server"` action file) so Vitest can import it
 * without dragging in NextAuth / Prisma.
 *
 * Returns null on success or a short human-readable error string.
 *
 * Rules:
 *   - At least two lines.
 *   - Each line is either a debit or a credit, never both.
 *   - Every line is non-zero on at least one side.
 *   - Σ DR = Σ CR (within a 0.001-rupee tolerance for FP noise).
 *   - Total > 0.
 */
export function validateManualJournalLines(
  lines: { debit: number; credit: number }[]
): string | null {
  if (lines.length < 2) return "Need at least two lines.";
  let totalDr = 0;
  let totalCr = 0;
  for (const l of lines) {
    if (l.debit > 0 && l.credit > 0) {
      return "Each line is either a debit or a credit, not both.";
    }
    if (l.debit === 0 && l.credit === 0) {
      return "Every line needs a non-zero debit or credit.";
    }
    totalDr += l.debit;
    totalCr += l.credit;
  }
  if (totalDr === 0) return "Total cannot be zero.";
  if (Math.abs(totalDr - totalCr) > 0.001) {
    return `Debits (${totalDr.toFixed(2)}) must equal credits (${totalCr.toFixed(2)}).`;
  }
  return null;
}
