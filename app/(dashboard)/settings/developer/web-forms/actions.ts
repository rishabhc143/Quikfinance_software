"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({ name: z.string().min(1).max(120), slug: z.string().regex(/^[a-z0-9-]+$/).max(120) });

export async function createWebFormAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({ name: formData.get("name"), slug: formData.get("slug") });
  const exists = await db.webForm.findUnique({ where: { slug: data.slug } });
  if (exists) throw new Error("That slug is taken.");
  const created = await db.webForm.create({ data: { organizationId: organization.id, ...data, formConfig: { fields: [{ name: "email", type: "email", required: true }] } } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "WebForm", entityId: created.id, after: data });
  revalidatePath("/settings/developer/web-forms");
}

export async function deleteWebFormAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.webForm.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "WebForm", entityId: id });
  revalidatePath("/settings/developer/web-forms");
}
