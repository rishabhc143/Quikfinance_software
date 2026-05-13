"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { computeSummary } from "@/lib/banking/reconciliation-summary";

/**
 * BNK-F — Server actions for the Reconciliation flow.
 *
 *   initiateReconciliationAction  — create a new IN_PROGRESS row
 *   toggleClearedAction           — flip cleared on one txn
 *   bulkSetClearedAction          — clear/unclear N txns at once
 *   finaliseReconciliationAction  — verify difference=0 + lock
 *   undoReconciliationAction      — reverse + unlock
 *   deleteReconciliationAction    — hard delete (UNDONE/IN_PROGRESS only)
 *
 * All actions: requireOrganization → ownership check → audit log →
 * revalidate.
 */

// ───────────────────────── helpers ─────────────────────────

async function loadReconciliation(id: string, organizationId: string) {
  return db.reconciliation.findFirst({
    where: { id, organizationId },
    include: { bankAccount: { select: { id: true, openingBalance: true } } },
  });
}

/** Eligible transactions for a reconciliation period. Same filter the
 *  two-pane page uses to render the left pane. */
function eligibilityWhere(rec: {
  bankAccountId: string;
  organizationId: string;
  startDate: Date;
  endDate: Date;
}) {
  // End date is inclusive — bank statements list 30 Apr as the last day.
  const endExclusive = new Date(rec.endDate);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return {
    organizationId: rec.organizationId,
    bankAccountId: rec.bankAccountId,
    date: { gte: rec.startDate, lt: endExclusive },
    excluded: false,
  };
}

// ───────────────────────── initiate ─────────────────────────

const initiateSchema = z.object({
  bankAccountId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  openingBalance: z.coerce.number(),
  closingBalance: z.coerce.number(),
  notes: z.string().max(2000).optional().nullable(),
});

export type InitiateInput = z.input<typeof initiateSchema>;

export async function initiateReconciliationAction(
  input: InitiateInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { user, organization } = await requireOrganization();
  const data = initiateSchema.parse(input);

  if (data.endDate < data.startDate) {
    return { ok: false, error: "End date must be on or after start date." };
  }

  const account = await db.bankAccount.findFirst({
    where: { id: data.bankAccountId, organizationId: organization.id },
    select: { id: true },
  });
  if (!account) return { ok: false, error: "Bank account not found." };

  // Block when another IN_PROGRESS reconciliation exists for this
  // account. The DB partial unique index is the hard guard; this
  // check just gives a friendlier error.
  const inProgress = await db.reconciliation.findFirst({
    where: { bankAccountId: account.id, status: "IN_PROGRESS" },
    select: { id: true },
  });
  if (inProgress) {
    return {
      ok: false,
      error:
        "A reconciliation is already in progress on this account. Finish or cancel it first.",
    };
  }

  // Block when the period overlaps a FINALISED reconciliation —
  // otherwise the same transactions could be cleared twice and the
  // opening-balance chain would split.
  const overlap = await db.reconciliation.findFirst({
    where: {
      bankAccountId: account.id,
      status: "FINALISED",
      // overlap iff start <= existing.end AND end >= existing.start
      startDate: { lte: data.endDate },
      endDate: { gte: data.startDate },
    },
    select: { id: true, startDate: true, endDate: true },
  });
  if (overlap) {
    return {
      ok: false,
      error: `Period overlaps a finalised reconciliation (${overlap.startDate
        .toISOString()
        .slice(0, 10)} → ${overlap.endDate.toISOString().slice(0, 10)}). Pick a non-overlapping range.`,
    };
  }

  const created = await db.reconciliation.create({
    data: {
      organizationId: organization.id,
      bankAccountId: account.id,
      startDate: data.startDate,
      endDate: data.endDate,
      openingBalance: data.openingBalance,
      closingBalance: data.closingBalance,
      notes: data.notes ?? null,
      createdById: user.id,
    },
    select: { id: true },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Reconciliation",
    entityId: created.id,
    after: {
      bankAccountId: account.id,
      period: `${data.startDate.toISOString().slice(0, 10)} → ${data.endDate.toISOString().slice(0, 10)}`,
      closingBalance: data.closingBalance,
    },
  });

  revalidatePath(`/banking/accounts/${account.id}`);
  revalidatePath(`/banking/accounts/${account.id}/reconcile`);
  return { ok: true, id: created.id };
}

/** Bind-friendly variant — redirects to the two-pane page on success. */
export async function initiateAndRedirectAction(
  input: InitiateInput
): Promise<void> {
  const res = await initiateReconciliationAction(input);
  if (!res.ok || !res.id) throw new Error(res.error ?? "Failed to start reconciliation");
  redirect(`/banking/accounts/${input.bankAccountId}/reconcile/${res.id}`);
}

// ───────────────────────── toggle / bulk clearing ─────────────────────────

export async function toggleClearedAction(input: {
  reconciliationId: string;
  bankTransactionId: string;
  cleared: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const rec = await loadReconciliation(input.reconciliationId, organization.id);
  if (!rec) return { ok: false, error: "Reconciliation not found." };
  if (rec.status !== "IN_PROGRESS") {
    return { ok: false, error: "This reconciliation is no longer editable." };
  }

  // Confirm the bank txn belongs to this period + account, OR is
  // already linked to this reconciliation (so un-clearing works).
  const txn = await db.bankTransaction.findFirst({
    where: {
      id: input.bankTransactionId,
      organizationId: organization.id,
      bankAccountId: rec.bankAccountId,
    },
    select: { id: true, reconciliationId: true, isReconciled: true, date: true, excluded: true },
  });
  if (!txn) return { ok: false, error: "Bank transaction not found in this period." };
  if (txn.excluded) return { ok: false, error: "Excluded transactions can't be reconciled." };

  // Only allow clearing rows whose date falls in the reconciliation period.
  // Already-cleared rows in this reconciliation always pass (unclear path).
  if (txn.reconciliationId !== rec.id) {
    const endExclusive = new Date(rec.endDate);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    if (txn.date < rec.startDate || txn.date >= endExclusive) {
      return { ok: false, error: "Transaction date is outside the reconciliation period." };
    }
  }

  await db.bankTransaction.update({
    where: { id: txn.id },
    data: input.cleared
      ? {
          isReconciled: true,
          reconciliationId: rec.id,
          reconciledAt: new Date(),
        }
      : {
          isReconciled: false,
          reconciliationId: null,
          reconciledAt: null,
        },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "BankTransaction",
    entityId: txn.id,
    before: { isReconciled: txn.isReconciled },
    after: { isReconciled: input.cleared, reconciliationId: input.cleared ? rec.id : null },
  });

  revalidatePath(`/banking/accounts/${rec.bankAccountId}/reconcile/${rec.id}`);
  return { ok: true };
}

export async function bulkSetClearedAction(input: {
  reconciliationId: string;
  bankTransactionIds: string[];
  cleared: boolean;
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.bankTransactionIds.length) return { ok: true, updated: 0 };

  const rec = await loadReconciliation(input.reconciliationId, organization.id);
  if (!rec) return { ok: false, error: "Reconciliation not found." };
  if (rec.status !== "IN_PROGRESS") {
    return { ok: false, error: "This reconciliation is no longer editable." };
  }

  // Update only rows that belong to this account + period + not excluded.
  const where = {
    id: { in: input.bankTransactionIds },
    ...eligibilityWhere(rec),
  };

  const result = await db.bankTransaction.updateMany({
    where,
    data: input.cleared
      ? {
          isReconciled: true,
          reconciliationId: rec.id,
          reconciledAt: new Date(),
        }
      : {
          isReconciled: false,
          reconciliationId: null,
          reconciledAt: null,
        },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Reconciliation",
    entityId: rec.id,
    after: { bulkCleared: input.cleared, updated: result.count },
  });

  revalidatePath(`/banking/accounts/${rec.bankAccountId}/reconcile/${rec.id}`);
  return { ok: true, updated: result.count };
}

// ───────────────────────── finalise / undo / delete ─────────────────────────

export async function finaliseReconciliationAction(input: {
  reconciliationId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const rec = await loadReconciliation(input.reconciliationId, organization.id);
  if (!rec) return { ok: false, error: "Reconciliation not found." };
  if (rec.status !== "IN_PROGRESS") {
    return { ok: false, error: "Only in-progress reconciliations can be finalised." };
  }

  // Recompute the summary server-side from scratch. Don't trust the
  // client's running total — a stale tab could finalise on yesterday's
  // checkboxes.
  const txns = await db.bankTransaction.findMany({
    where: eligibilityWhere(rec),
    select: { id: true, amount: true, type: true, reconciliationId: true },
  });
  const summary = computeSummary({
    openingBalance: Number(rec.openingBalance),
    closingBalance: Number(rec.closingBalance),
    lines: txns.map((t) => ({
      id: t.id,
      amount: Number(t.amount),
      type: t.type === "CREDIT" ? "CREDIT" : "DEBIT",
      cleared: t.reconciliationId === rec.id,
    })),
  });
  if (!summary.balanced) {
    return {
      ok: false,
      error: `Difference is ${summary.difference.toFixed(2)} — must be 0 to finalise.`,
    };
  }

  await db.reconciliation.update({
    where: { id: rec.id },
    data: {
      status: "FINALISED",
      finalisedAt: new Date(),
      finalisedById: user.id,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Reconciliation",
    entityId: rec.id,
    before: { status: "IN_PROGRESS" },
    after: {
      status: "FINALISED",
      clearedCount: summary.clearedCount,
      netCleared: summary.netCleared,
    },
  });

  revalidatePath(`/banking/accounts/${rec.bankAccountId}`);
  revalidatePath(`/banking/accounts/${rec.bankAccountId}/reconcile`);
  revalidatePath(`/banking/accounts/${rec.bankAccountId}/reconcile/${rec.id}`);
  return { ok: true };
}

export async function undoReconciliationAction(input: {
  reconciliationId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const rec = await loadReconciliation(input.reconciliationId, organization.id);
  if (!rec) return { ok: false, error: "Reconciliation not found." };
  if (rec.status === "UNDONE") {
    return { ok: false, error: "Already undone." };
  }

  await db.$transaction([
    db.bankTransaction.updateMany({
      where: {
        reconciliationId: rec.id,
        organizationId: organization.id,
      },
      data: {
        isReconciled: false,
        reconciliationId: null,
        reconciledAt: null,
      },
    }),
    db.reconciliation.update({
      where: { id: rec.id },
      data: {
        status: "UNDONE",
        finalisedAt: null,
        finalisedById: null,
      },
    }),
  ]);

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Reconciliation",
    entityId: rec.id,
    before: { status: rec.status },
    after: { status: "UNDONE" },
  });

  revalidatePath(`/banking/accounts/${rec.bankAccountId}`);
  revalidatePath(`/banking/accounts/${rec.bankAccountId}/reconcile`);
  return { ok: true };
}

export async function deleteReconciliationAction(input: {
  reconciliationId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const rec = await loadReconciliation(input.reconciliationId, organization.id);
  if (!rec) return { ok: false, error: "Reconciliation not found." };
  if (rec.status === "FINALISED") {
    return {
      ok: false,
      error: "Undo the reconciliation first, then delete it.",
    };
  }

  await db.$transaction([
    // Unlock any rows still pointing at this rec (mostly IN_PROGRESS cases).
    db.bankTransaction.updateMany({
      where: {
        reconciliationId: rec.id,
        organizationId: organization.id,
      },
      data: {
        isReconciled: false,
        reconciliationId: null,
        reconciledAt: null,
      },
    }),
    db.reconciliation.delete({ where: { id: rec.id } }),
  ]);

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "Reconciliation",
    entityId: rec.id,
    before: { status: rec.status },
  });

  revalidatePath(`/banking/accounts/${rec.bankAccountId}`);
  revalidatePath(`/banking/accounts/${rec.bankAccountId}/reconcile`);
  return { ok: true };
}

// ───────────────────────── bind-friendly wrappers ─────────────────────────

export async function finaliseByIdAction(reconciliationId: string): Promise<void> {
  const res = await finaliseReconciliationAction({ reconciliationId });
  if (!res.ok) throw new Error(res.error ?? "Finalise failed");
}

export async function undoByIdAction(reconciliationId: string): Promise<void> {
  const res = await undoReconciliationAction({ reconciliationId });
  if (!res.ok) throw new Error(res.error ?? "Undo failed");
}

export async function deleteByIdAction(reconciliationId: string): Promise<void> {
  const res = await deleteReconciliationAction({ reconciliationId });
  if (!res.ok) throw new Error(res.error ?? "Delete failed");
}
