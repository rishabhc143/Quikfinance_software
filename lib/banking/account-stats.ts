import "server-only";
import { db } from "@/lib/db";

/**
 * BNK-B — Per-account dashboard stats.
 *
 * One helper, six counts + three header strips, evaluated in a single
 * Promise.all. The counts are mutually exclusive — every
 * BankTransaction on this account is in exactly one of:
 *
 *   - duplicates       (excluded = true)
 *   - autocategorised  (appliedRuleId IS NOT NULL)        — rule fired
 *   - bestMatches      (matchedRecordType IS NOT NULL AND appliedRuleId IS NULL)
 *                                                          — user manually matched/categorised
 *   - uncategorised    (matchedRecordType IS NULL AND excluded = false)
 *                                                          — nothing happened yet
 *
 * Recognised is reserved for BNK-E.2 (when rules grow a "needs user
 * confirmation" mode). Always 0 in v1.
 *
 * Total = autocategorised + bestMatches + uncategorised + duplicates.
 * The caller can sanity-check that math; we don't enforce it here
 * (a soft check makes wrong reports louder).
 */
export type BankAccountStats = {
  total: number;
  autocategorised: number;
  recognised: number;
  bestMatches: number;
  uncategorised: number;
  duplicates: number;
  /** Date of the most recent successful import. Null if no imports yet. */
  latestStatementAt: Date | null;
  /** BNK-F will populate this. Null in v1. */
  lastReconciledAt: Date | null;
  /** Count of active rules that could fire on this account (per-account + org-wide). */
  activeRulesCount: number;
};

export async function getBankAccountStats(
  bankAccountId: string,
  organizationId: string
): Promise<BankAccountStats> {
  const [
    total,
    autocategorised,
    bestMatches,
    uncategorised,
    duplicates,
    latestBatch,
    activeRulesCount,
    lastFinalisedReconciliation,
  ] = await Promise.all([
    db.bankTransaction.count({ where: { bankAccountId } }),
    db.bankTransaction.count({
      where: { bankAccountId, appliedRuleId: { not: null } },
    }),
    db.bankTransaction.count({
      where: {
        bankAccountId,
        matchedRecordType: { not: null },
        appliedRuleId: null,
      },
    }),
    db.bankTransaction.count({
      where: {
        bankAccountId,
        matchedRecordType: null,
        excluded: false,
      },
    }),
    db.bankTransaction.count({
      where: { bankAccountId, excluded: true },
    }),
    db.bankImportBatch.findFirst({
      where: { bankAccountId, organizationId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.bankRule.count({
      where: {
        organizationId,
        isActive: true,
        OR: [{ bankAccountId }, { bankAccountId: null }],
      },
    }),
    // BNK-F — most recently finalised reconciliation, by its end date
    // (not finalisedAt, since the user might finalise out of order).
    db.reconciliation.findFirst({
      where: { bankAccountId, organizationId, status: "FINALISED" },
      orderBy: { endDate: "desc" },
      select: { endDate: true },
    }),
  ]);

  return {
    total,
    autocategorised,
    recognised: 0, // BNK-E.2
    bestMatches,
    uncategorised,
    duplicates,
    latestStatementAt: latestBatch?.createdAt ?? null,
    lastReconciledAt: lastFinalisedReconciliation?.endDate ?? null,
    activeRulesCount,
  };
}
