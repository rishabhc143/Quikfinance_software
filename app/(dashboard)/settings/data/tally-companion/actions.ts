"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { runPaymentMatcher } from "@/lib/migration/payment-matcher";

/**
 * Sprint 4 — Roll back a MigrationBatch.
 *
 * Soft-deletes every CompanionVoucher + CompanionLedger created by
 * the batch (their FK with onDelete: Cascade isn't used — we set
 * deletedAt instead so the partial unique index on
 * (orgId, sourceFormat, sourceGuid) WHERE deletedAt IS NULL releases
 * the slots for a future re-import).
 *
 * Then re-runs the payment matcher across what remains, so any
 * Sales vouchers from OTHER batches that had paidAmount populated by
 * Receipts in THIS now-undone batch get their paidAmount recomputed
 * downward.
 *
 * Constraints:
 *   - Org-scoped: passing a batch id from another org silently no-ops.
 *   - Rollback window: must be within rollbackExpiresAt (30 days
 *     post-completion). Outside the window we refuse.
 *   - Idempotent: rolling back an already-rolled-back batch is a no-op.
 */
export async function rollbackBatchAction(batchId: string): Promise<
  { ok: true; ledgers: number; vouchers: number } | { ok: false; error: string }
> {
  const { user, organization } = await requireOrganization();

  const batch = await db.migrationBatch.findFirst({
    where: { id: batchId, organizationId: organization.id },
    select: {
      id: true,
      status: true,
      rollbackExpiresAt: true,
      insertedLedgers: true,
      insertedVouchers: true,
    },
  });
  if (!batch) return { ok: false, error: "Batch not found." };
  if (batch.status === "rolled_back") {
    return { ok: true, ledgers: 0, vouchers: 0 };
  }
  if (batch.status !== "done") {
    return { ok: false, error: `Cannot roll back a batch in status '${batch.status}'.` };
  }
  if (
    batch.rollbackExpiresAt &&
    batch.rollbackExpiresAt.getTime() < Date.now()
  ) {
    return {
      ok: false,
      error: "Rollback window expired (30 days post-import). Contact support if you need help.",
    };
  }

  const now = new Date();
  await db.$transaction([
    db.companionVoucher.updateMany({
      where: { migrationBatchId: batchId, deletedAt: null },
      data: { deletedAt: now },
    }),
    db.companionLedger.updateMany({
      where: { migrationBatchId: batchId, deletedAt: null },
      data: { deletedAt: now },
    }),
    db.migrationBatch.update({
      where: { id: batchId },
      data: { status: "rolled_back" },
    }),
  ]);

  // Re-run the matcher so any cross-batch paidAmount values that
  // referenced this batch's receipts get recomputed.
  try {
    await runPaymentMatcher(organization.id);
  } catch (e) {
    console.error("[companion/rollback] matcher re-run failed", e);
  }

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "MigrationBatch",
    entityId: batchId,
    before: {
      status: "done",
      insertedLedgers: batch.insertedLedgers,
      insertedVouchers: batch.insertedVouchers,
    },
    after: { status: "rolled_back" },
  });

  revalidatePath("/settings/data/tally-companion");
  return {
    ok: true,
    ledgers: batch.insertedLedgers,
    vouchers: batch.insertedVouchers,
  };
}
