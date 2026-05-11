"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  profileName: z.string().min(1).max(120),
  category: z.string().max(80).nullable().optional(),
  contactId: z.string().nullable().optional(),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  nextRunAt: z.coerce.date(),
  amount: z.coerce.number().nonnegative(),
});

export async function createRecurringExpenseAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({
    profileName: formData.get("profileName"),
    category: formData.get("category") || null,
    contactId: formData.get("contactId") || null,
    frequency: formData.get("frequency"),
    nextRunAt: formData.get("nextRunAt"),
    amount: formData.get("amount") || 0,
  });
  const created = await db.recurringExpense.create({ data: { organizationId: organization.id, ...data, contactId: data.contactId ?? null } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "RecurringExpense", entityId: created.id, after: { profileName: data.profileName } });
  revalidatePath("/purchases/recurring-expenses");
  redirect("/purchases/recurring-expenses");
}

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
    data: {
      deletedAt: new Date(),
      isActive: false,
      status: "STOPPED",
    },
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
  const r = await db.recurringExpense.findFirst({ where: { id, organizationId: organization.id } });
  if (!r) return { ok: false };
  await db.recurringExpense.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "RecurringExpense", entityId: id, before: { profileName: r.profileName } });
  revalidatePath("/purchases/recurring-expenses");
  return { ok: true };
}
