"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(120),
  appliesTo: z.enum(["invoice", "bill", "estimate"]),
  daysBefore: z.coerce.number().int().min(0).max(365).default(0),
  daysAfter: z.coerce.number().int().min(0).max(365).default(0),
  template: z.string().max(2000).optional().nullable(),
});

export async function createReminderAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({
    name: formData.get("name"),
    appliesTo: formData.get("appliesTo"),
    daysBefore: formData.get("daysBefore") || 0,
    daysAfter: formData.get("daysAfter") || 0,
    template: formData.get("template") || null,
  });
  const created = await db.reminder.create({ data: { organizationId: organization.id, ...data, template: data.template ?? null } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Reminder", entityId: created.id, after: { name: data.name } });
  revalidatePath("/settings/reminders");
}

export async function setReminderActiveAction(id: string, isActive: boolean) {
  const { user, organization } = await requireOrganization();
  await db.reminder.update({ where: { id }, data: { isActive } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "UPDATE", entityType: "Reminder", entityId: id, after: { isActive } });
  revalidatePath("/settings/reminders");
}

export async function deleteReminderAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.reminder.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Reminder", entityId: id });
  revalidatePath("/settings/reminders");
}
