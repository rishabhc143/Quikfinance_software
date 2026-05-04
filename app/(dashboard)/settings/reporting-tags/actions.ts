"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1d4ed8"),
});

export async function createReportingTagAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({ name: formData.get("name"), color: formData.get("color") || "#1d4ed8" });
  const exists = await db.reportingTag.findUnique({ where: { organizationId_name: { organizationId: organization.id, name: data.name } } });
  if (exists) throw new Error("That tag already exists.");
  const created = await db.reportingTag.create({ data: { organizationId: organization.id, ...data } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "ReportingTag", entityId: created.id, after: data });
  revalidatePath("/settings/reporting-tags");
}

export async function deleteReportingTagAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.reportingTag.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "ReportingTag", entityId: id });
  revalidatePath("/settings/reporting-tags");
}
