"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  mimeType: z.string().max(80).optional().nullable(),
  folder: z.string().max(80).optional().nullable(),
});

export async function createDocumentAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({
    name: formData.get("name"),
    url: formData.get("url"),
    mimeType: formData.get("mimeType") || null,
    folder: formData.get("folder") || null,
  });
  const created = await db.document.create({
    data: { organizationId: organization.id, ...data, uploadedBy: user.id },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Document", entityId: created.id, after: { name: data.name } });
  revalidatePath("/documents");
  redirect("/documents");
}

export async function deleteDocumentAction(id: string) {
  const { user, organization } = await requireOrganization();
  const d = await db.document.findFirst({ where: { id, organizationId: organization.id } });
  if (!d) return { ok: false };
  await db.document.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Document", entityId: id, before: { name: d.name } });
  revalidatePath("/documents");
  return { ok: true };
}
