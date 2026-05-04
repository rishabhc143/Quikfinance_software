"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(120),
  cron: z.string().min(1).max(80),
  taskKind: z.string().min(1).max(40),
});

export async function createScheduleAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({ name: formData.get("name"), cron: formData.get("cron"), taskKind: formData.get("taskKind") });
  const created = await db.schedule.create({ data: { organizationId: organization.id, ...data } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Schedule", entityId: created.id, after: data });
  revalidatePath("/settings/schedules");
}

export async function deleteScheduleAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.schedule.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Schedule", entityId: id });
  revalidatePath("/settings/schedules");
}
