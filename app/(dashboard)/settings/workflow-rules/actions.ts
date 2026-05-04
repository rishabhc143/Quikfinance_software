"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(120),
  module: z.string().min(1).max(40),
  trigger: z.string().min(1).max(40),
});

export async function createWorkflowRuleAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({ name: formData.get("name"), module: formData.get("module"), trigger: formData.get("trigger") });
  const created = await db.workflowRule.create({ data: { organizationId: organization.id, ...data, conditions: {}, actions: {} } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "WorkflowRule", entityId: created.id, after: data });
  revalidatePath("/settings/workflow-rules");
}

export async function setWorkflowRuleActiveAction(id: string, isActive: boolean) {
  const { user, organization } = await requireOrganization();
  await db.workflowRule.update({ where: { id }, data: { isActive } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "UPDATE", entityType: "WorkflowRule", entityId: id, after: { isActive } });
  revalidatePath("/settings/workflow-rules");
}

export async function deleteWorkflowRuleAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.workflowRule.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "WorkflowRule", entityId: id });
  revalidatePath("/settings/workflow-rules");
}
