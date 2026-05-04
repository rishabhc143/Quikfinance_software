"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { PERMISSION_KEYS } from "./permissions";

const schema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional().nullable(),
  permissions: z.array(z.string()),
});

export async function createCustomRoleAction(formData: FormData) {
  const { user, organization, membership } = await requireOrganization();
  if (membership.role !== "ADMIN") throw new Error("Only admins can create roles");
  const data = schema.parse({
    name: formData.get("name"),
    description: formData.get("description") || null,
    permissions: formData.getAll("permissions").filter((p): p is string => typeof p === "string" && (PERMISSION_KEYS as readonly string[]).includes(p)),
  });
  const created = await db.customRole.create({
    data: { organizationId: organization.id, name: data.name, description: data.description ?? null, permissions: data.permissions },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "CustomRole", entityId: created.id, after: { name: data.name, permissionsCount: data.permissions.length } });
  revalidatePath("/settings/roles");
  return { ok: true };
}

export async function deleteCustomRoleAction(id: string) {
  const { user, organization, membership } = await requireOrganization();
  if (membership.role !== "ADMIN") throw new Error("Only admins can delete roles");
  const r = await db.customRole.findFirst({ where: { id, organizationId: organization.id } });
  if (!r) return { ok: false };
  await db.customRole.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "CustomRole", entityId: id, before: { name: r.name } });
  revalidatePath("/settings/roles");
  return { ok: true };
}

