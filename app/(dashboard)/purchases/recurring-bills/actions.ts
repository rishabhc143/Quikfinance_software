"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  profileName: z.string().min(1).max(120),
  contactId: z.string().nullable().optional(),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  nextRunAt: z.coerce.date(),
  amount: z.coerce.number().nonnegative(),
});

export async function createRecurringBillAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({
    profileName: formData.get("profileName"),
    contactId: formData.get("contactId") || null,
    frequency: formData.get("frequency"),
    nextRunAt: formData.get("nextRunAt"),
    amount: formData.get("amount") || 0,
  });
  const created = await db.recurringBill.create({
    data: { organizationId: organization.id, ...data, contactId: data.contactId ?? null },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "RecurringBill", entityId: created.id, after: { profileName: data.profileName } });
  revalidatePath("/purchases/recurring-bills");
  redirect("/purchases/recurring-bills");
}

/**
 * Bulk transitions for the Recurring Bills list.
 *
 * Pause/Resume flip both the legacy `isActive` flag (back-compat
 * with the cron) and the new `status` string ("PAUSED" | "ACTIVE")
 * so older queries and newer queries stay consistent.
 */
export async function bulkPauseRecurringBillsAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.recurringBill.updateMany({
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
    entityType: "RecurringBill",
    entityId: `bulk-pause-${Date.now()}`,
    after: { count: result.count, ids: input.ids, status: "PAUSED" },
  });
  revalidatePath("/purchases/recurring-bills");
  return { ok: true, updated: result.count };
}

export async function bulkResumeRecurringBillsAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.recurringBill.updateMany({
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
    entityType: "RecurringBill",
    entityId: `bulk-resume-${Date.now()}`,
    after: { count: result.count, ids: input.ids, status: "ACTIVE" },
  });
  revalidatePath("/purchases/recurring-bills");
  return { ok: true, updated: result.count };
}

export async function bulkDeleteRecurringBillsAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  // Soft-delete + status=STOPPED so the cron skips the row.
  const result = await db.recurringBill.updateMany({
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
    entityType: "RecurringBill",
    entityId: `bulk-delete-${Date.now()}`,
    before: { count: result.count, ids: input.ids },
  });
  revalidatePath("/purchases/recurring-bills");
  return { ok: true, updated: result.count };
}

export async function deleteRecurringBillAction(id: string) {
  const { user, organization } = await requireOrganization();
  const r = await db.recurringBill.findFirst({ where: { id, organizationId: organization.id } });
  if (!r) return { ok: false };
  await db.recurringBill.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "RecurringBill", entityId: id, before: { profileName: r.profileName } });
  revalidatePath("/purchases/recurring-bills");
  return { ok: true };
}
