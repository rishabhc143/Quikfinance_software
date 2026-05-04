"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({ name: z.string().min(1).max(120), url: z.string().url() });

export async function createWebTabAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({ name: formData.get("name"), url: formData.get("url") });
  const created = await db.webTab.create({ data: { organizationId: organization.id, ...data } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "WebTab", entityId: created.id, after: data });
  revalidatePath("/settings/web-tabs");
}

export async function deleteWebTabAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.webTab.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "WebTab", entityId: id });
  revalidatePath("/settings/web-tabs");
}
