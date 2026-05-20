"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  projectId: z.string().min(1),
  taskId: z.string().nullable().optional(),
  date: z.coerce.date(),
  hours: z.coerce.number().positive().max(24),
  description: z.string().max(500).optional().nullable(),
  // Per-entry billable override. nullable means "not specified".
  billable: z.boolean().optional().nullable(),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  // FormData strings: "true" / "false" / "" → coerce manually.
  let billable: boolean | null | undefined = undefined;
  if (raw.billable === "true") billable = true;
  else if (raw.billable === "false") billable = false;
  return schema.parse({
    projectId: raw.projectId,
    taskId: raw.taskId === "" ? null : raw.taskId,
    date: raw.date,
    hours: raw.hours,
    description: raw.description || null,
    billable,
  });
}

export async function createTimeEntryAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = parse(formData);
  const created = await db.timeEntry.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      ...data,
      taskId: data.taskId ?? null,
      description: data.description ?? null,
      billable: data.billable ?? null,
    },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "TimeEntry",
    entityId: created.id,
    after: {
      hours: data.hours,
      projectId: data.projectId,
      taskId: data.taskId ?? null,
      billable: data.billable ?? null,
    },
  });
  revalidatePath("/time/entries");
  redirect("/time/entries");
}

export async function deleteTimeEntryAction(id: string) {
  const { user, organization } = await requireOrganization();
  const e = await db.timeEntry.findFirst({ where: { id, organizationId: organization.id } });
  if (!e) return { ok: false };
  await db.timeEntry.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "TimeEntry", entityId: id });
  revalidatePath("/time/entries");
  return { ok: true };
}
