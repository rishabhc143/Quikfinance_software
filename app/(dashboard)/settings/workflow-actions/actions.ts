"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["email", "webhook", "field-update", "create-task"]),
});

export async function createWorkflowActionAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({ name: formData.get("name"), kind: formData.get("kind") });
  const created = await db.workflowAction.create({ data: { organizationId: organization.id, ...data, config: {} } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "WorkflowAction", entityId: created.id, after: data });
  revalidatePath("/settings/workflow-actions");
}

export async function deleteWorkflowActionAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.workflowAction.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "WorkflowAction", entityId: id });
  revalidatePath("/settings/workflow-actions");
}
