"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  recurringExpenseSchema,
  type RecurringExpenseInput,
} from "@/lib/validations/recurring-expense";
import {
  generateExpenseFromProfile,
  advanceRecurringExpenseCursor,
  computeNextOccurrence,
} from "@/lib/purchases/recurring";

export type { RecurringExpenseInput };

/**
 * Recurring Expenses server actions per <recurring_expenses_spec>.
 *
 * Intentionally simpler than Recurring Bills — no line items, no
 * templateJson. The cron reads the profile's fields directly and
 * creates a one-row Expense. When customerId is set + isBillable
 * = true, the generated Expense surfaces on the customer's next
 * Invoice via the BillableExpensesPanel (PR #97).
 */

export async function createRecurringExpenseAction(
  input: RecurringExpenseInput
) {
  const { user, organization } = await requireOrganization();
  const data = recurringExpenseSchema.parse(input);

  const created = await db.recurringExpense.create({
    data: {
      organizationId: organization.id,
      profileName: data.profileName,
      category: data.category ?? null,
      contactId: data.contactId ?? null,
      customerId: data.customerId ?? null,
      isBillable: data.isBillable,
      expenseAccountId: data.expenseAccountId,
      paidThroughAccountId: data.paidThroughAccountId,
      frequency: data.frequency,
      intervalN: data.intervalN,
      startDate: data.startDate,
      endDate: data.neverExpires ? null : data.endDate ?? null,
      neverExpires: data.neverExpires,
      nextRunAt: data.startDate,
      nextOccurrenceDate: data.startDate,
      status: data.status,
      isActive: data.status === "ACTIVE",
      amount: data.amount,
      notes: data.notes ?? null,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "RecurringExpense",
    entityId: created.id,
    after: {
      profileName: created.profileName,
      frequency: created.frequency,
      amount: Number(created.amount),
    },
  });

  revalidatePath("/purchases/recurring-expenses");
  redirect(`/purchases/recurring-expenses/${created.id}`);
}

export async function updateRecurringExpenseAction(
  id: string,
  input: RecurringExpenseInput
) {
  const { user, organization } = await requireOrganization();
  const data = recurringExpenseSchema.parse(input);
  const before = await db.recurringExpense.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!before) throw new Error("Recurring expense not found");
  if (before.status === "STOPPED" || before.status === "EXPIRED") {
    throw new Error(
      `Cannot edit a ${before.status.toLowerCase()} profile.`
    );
  }

  await db.recurringExpense.update({
    where: { id },
    data: {
      profileName: data.profileName,
      category: data.category ?? null,
      contactId: data.contactId ?? null,
      customerId: data.customerId ?? null,
      isBillable: data.isBillable,
      expenseAccountId: data.expenseAccountId,
      paidThroughAccountId: data.paidThroughAccountId,
      frequency: data.frequency,
      intervalN: data.intervalN,
      startDate: data.startDate,
      endDate: data.neverExpires ? null : data.endDate ?? null,
      neverExpires: data.neverExpires,
      status: data.status,
      isActive: data.status === "ACTIVE",
      amount: data.amount,
      notes: data.notes ?? null,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringExpense",
    entityId: id,
    before: { profileName: before.profileName, status: before.status },
    after: { profileName: data.profileName, status: data.status },
  });
  revalidatePath("/purchases/recurring-expenses");
  revalidatePath(`/purchases/recurring-expenses/${id}`);
  redirect(`/purchases/recurring-expenses/${id}`);
}

// ───── Transitions ────────────────────────────────────────────────

export async function pauseRecurringExpenseAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.recurringExpense.update({
    where: { id, organizationId: organization.id },
    data: { status: "PAUSED", isActive: false },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringExpense",
    entityId: id,
    after: { status: "PAUSED" },
  });
  revalidatePath("/purchases/recurring-expenses");
  revalidatePath(`/purchases/recurring-expenses/${id}`);
}

export async function resumeRecurringExpenseAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.recurringExpense.update({
    where: { id, organizationId: organization.id },
    data: { status: "ACTIVE", isActive: true },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringExpense",
    entityId: id,
    after: { status: "ACTIVE" },
  });
  revalidatePath("/purchases/recurring-expenses");
  revalidatePath(`/purchases/recurring-expenses/${id}`);
}

export async function stopRecurringExpenseAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.recurringExpense.update({
    where: { id, organizationId: organization.id },
    data: { status: "STOPPED", isActive: false },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringExpense",
    entityId: id,
    after: { status: "STOPPED" },
  });
  revalidatePath("/purchases/recurring-expenses");
  revalidatePath(`/purchases/recurring-expenses/${id}`);
}

export async function runRecurringExpenseNowAction(
  id: string
): Promise<void> {
  const { user, organization } = await requireOrganization();
  const profile = await db.recurringExpense.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!profile) throw new Error("Recurring expense not found");
  if (profile.status !== "ACTIVE") {
    throw new Error(
      `Cannot run a ${profile.status.toLowerCase()} profile.`
    );
  }
  const today = new Date();
  await generateExpenseFromProfile(id, today);
  await advanceRecurringExpenseCursor(id, today);
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringExpense",
    entityId: id,
    after: { ranNow: true, ranAt: today.toISOString() },
  });
  revalidatePath("/purchases/recurring-expenses");
  revalidatePath(`/purchases/recurring-expenses/${id}`);
  revalidatePath("/purchases/expenses");
}

export async function previewNextExpenseRunsAction(input: {
  recurringExpenseId: string;
}): Promise<Date[]> {
  const { organization } = await requireOrganization();
  const profile = await db.recurringExpense.findFirst({
    where: {
      id: input.recurringExpenseId,
      organizationId: organization.id,
      deletedAt: null,
    },
  });
  if (!profile) return [];
  const out: Date[] = [];
  let cursor = profile.nextRunAt;
  for (let i = 0; i < 5; i += 1) {
    out.push(cursor);
    cursor = computeNextOccurrence(
      cursor,
      profile.frequency,
      profile.intervalN
    );
    if (
      !profile.neverExpires &&
      profile.endDate &&
      cursor > profile.endDate
    )
      break;
  }
  return out;
}

// ───── Bulk handlers retained from parity sweep ───────────────────

export async function bulkPauseRecurringExpensesAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.recurringExpense.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    data: { isActive: false, status: "PAUSED" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringExpense",
    entityId: `bulk-pause-${Date.now()}`,
    after: { count: result.count, ids: input.ids, status: "PAUSED" },
  });
  revalidatePath("/purchases/recurring-expenses");
  return { ok: true, updated: result.count };
}

export async function bulkResumeRecurringExpensesAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.recurringExpense.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    data: { isActive: true, status: "ACTIVE" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringExpense",
    entityId: `bulk-resume-${Date.now()}`,
    after: { count: result.count, ids: input.ids, status: "ACTIVE" },
  });
  revalidatePath("/purchases/recurring-expenses");
  return { ok: true, updated: result.count };
}

export async function bulkDeleteRecurringExpensesAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.recurringExpense.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    data: { deletedAt: new Date(), isActive: false, status: "STOPPED" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "RecurringExpense",
    entityId: `bulk-delete-${Date.now()}`,
    before: { count: result.count, ids: input.ids },
  });
  revalidatePath("/purchases/recurring-expenses");
  return { ok: true, updated: result.count };
}

export async function deleteRecurringExpenseAction(id: string) {
  const { user, organization } = await requireOrganization();
  const r = await db.recurringExpense.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!r) return { ok: false };
  await db.recurringExpense.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false, status: "STOPPED" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "RecurringExpense",
    entityId: id,
    before: { profileName: r.profileName },
  });
  revalidatePath("/purchases/recurring-expenses");
  return { ok: true };
}
