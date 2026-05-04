"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  profileName: z.string().min(1).max(120),
  contactId: z.string().min(1),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  nextRunAt: z.coerce.date(),
  amount: z.coerce.number().nonnegative(),
});

export async function createRecurringInvoiceAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({
    profileName: formData.get("profileName"),
    contactId: formData.get("contactId"),
    frequency: formData.get("frequency"),
    nextRunAt: formData.get("nextRunAt"),
    amount: formData.get("amount") || 0,
  });
  const created = await db.recurringInvoice.create({
    data: { organizationId: organization.id, ...data },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "RecurringInvoice", entityId: created.id, after: { profileName: data.profileName } });
  revalidatePath("/sales/recurring-invoices");
  redirect("/sales/recurring-invoices");
}

export async function setRecurringInvoiceActiveAction(id: string, isActive: boolean) {
  const { user, organization } = await requireOrganization();
  const r = await db.recurringInvoice.findFirst({ where: { id, organizationId: organization.id } });
  if (!r) return { ok: false };
  await db.recurringInvoice.update({ where: { id }, data: { isActive } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "UPDATE", entityType: "RecurringInvoice", entityId: id, after: { isActive } });
  revalidatePath("/sales/recurring-invoices");
  return { ok: true };
}

export async function deleteRecurringInvoiceAction(id: string) {
  const { user, organization } = await requireOrganization();
  const r = await db.recurringInvoice.findFirst({ where: { id, organizationId: organization.id } });
  if (!r) return { ok: false };
  await db.recurringInvoice.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "RecurringInvoice", entityId: id, before: { profileName: r.profileName } });
  revalidatePath("/sales/recurring-invoices");
  return { ok: true };
}
