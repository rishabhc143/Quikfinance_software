"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const addSchema = z.object({ name: z.string().min(1).max(120), address: z.string().max(500).optional().nullable() });

export async function addLocationAction(input: z.input<typeof addSchema>) {
  const { user, organization } = await requireOrganization();
  const data = addSchema.parse(input);
  const count = await db.location.count({ where: { organizationId: organization.id } });
  const created = await db.location.create({
    data: {
      organizationId: organization.id,
      name: data.name,
      address: data.address ?? null,
      isPrimary: count === 0,
    },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Location", entityId: created.id, after: { name: created.name } });
  revalidatePath("/settings/locations");
  return { ok: true };
}

export async function deleteLocationAction(id: string) {
  const { user, organization } = await requireOrganization();
  const loc = await db.location.findFirst({ where: { id, organizationId: organization.id } });
  if (!loc) return { ok: false };
  await db.location.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Location", entityId: id, before: { name: loc.name } });
  // promote first remaining as primary if needed
  if (loc.isPrimary) {
    const next = await db.location.findFirst({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
    if (next) await db.location.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
  revalidatePath("/settings/locations");
  return { ok: true };
}

export async function makePrimaryLocationAction(id: string) {
  const { user, organization } = await requireOrganization();
  const loc = await db.location.findFirst({ where: { id, organizationId: organization.id } });
  if (!loc) return { ok: false };
  await db.$transaction([
    db.location.updateMany({ where: { organizationId: organization.id, isPrimary: true }, data: { isPrimary: false } }),
    db.location.update({ where: { id }, data: { isPrimary: true } }),
  ]);
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "UPDATE", entityType: "Location", entityId: id, after: { isPrimary: true } });
  revalidatePath("/settings/locations");
  return { ok: true };
}
