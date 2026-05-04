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

export async function deleteRecurringBillAction(id: string) {
  const { user, organization } = await requireOrganization();
  const r = await db.recurringBill.findFirst({ where: { id, organizationId: organization.id } });
  if (!r) return { ok: false };
  await db.recurringBill.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "RecurringBill", entityId: id, before: { profileName: r.profileName } });
  revalidatePath("/purchases/recurring-bills");
  return { ok: true };
}
