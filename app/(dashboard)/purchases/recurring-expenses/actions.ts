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

export async function deleteRecurringExpenseAction(id: string) {
  const { user, organization } = await requireOrganization();
  const r = await db.recurringExpense.findFirst({ where: { id, organizationId: organization.id } });
  if (!r) return { ok: false };
  await db.recurringExpense.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "RecurringExpense", entityId: id, before: { profileName: r.profileName } });
  revalidatePath("/purchases/recurring-expenses");
  return { ok: true };
}
