"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(["todo", "in_progress", "done"]).default("todo"),
  hourlyRate: z.coerce.number().nonnegative().optional().nullable(),
});

export async function createTaskAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({
    projectId: formData.get("projectId"),
    name: formData.get("name"),
    description: formData.get("description") || null,
    status: formData.get("status") || "todo",
    hourlyRate: formData.get("hourlyRate") || null,
  });
  // Verify project ownership
  const project = await db.project.findFirst({ where: { id: data.projectId, organizationId: organization.id } });
  if (!project) throw new Error("Project not found");
  const created = await db.task.create({
    data: {
      organizationId: organization.id, projectId: data.projectId,
      name: data.name, description: data.description ?? null,
      status: data.status, hourlyRate: data.hourlyRate ?? null,
    },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Task", entityId: created.id, after: { name: data.name, projectId: data.projectId } });
  revalidatePath(`/time/projects/${data.projectId}`);
  redirect(`/time/projects/${data.projectId}`);
}

export async function deleteTaskAction(id: string) {
  const { user, organization } = await requireOrganization();
  const t = await db.task.findFirst({ where: { id, organizationId: organization.id } });
  if (!t) return { ok: false };
  await db.task.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Task", entityId: id, before: { name: t.name } });
  revalidatePath(`/time/projects/${t.projectId}`);
  return { ok: true };
}
