"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const addSchema = z.object({
  name: z.string().min(1).max(80),
  rate: z.coerce.number().min(0).max(100),
  type: z.string().min(2),
  isCompound: z.boolean().default(false),
});

export async function addTaxAction(input: z.input<typeof addSchema>) {
  const { user, organization } = await requireOrganization();
  const data = addSchema.parse(input);
  const exists = await db.tax.findUnique({ where: { organizationId_name: { organizationId: organization.id, name: data.name } } });
  if (exists) throw new Error("A tax with that name already exists.");
  const created = await db.tax.create({
    data: {
      organizationId: organization.id,
      name: data.name,
      rate: data.rate,
      type: data.type,
      isCompound: data.isCompound,
    },
  });
  await writeAuditLog({
    organizationId: organization.id, userId: user.id,
    action: "CREATE", entityType: "Tax", entityId: created.id,
    after: { name: created.name, rate: data.rate },
  });
  revalidatePath("/settings/taxes");
  return { ok: true };
}

export async function setTaxActiveAction(id: string, isActive: boolean) {
  const { user, organization } = await requireOrganization();
  const tax = await db.tax.findFirst({ where: { id, organizationId: organization.id } });
  if (!tax) return { ok: false };
  await db.tax.update({ where: { id }, data: { isActive } });
  await writeAuditLog({
    organizationId: organization.id, userId: user.id,
    action: "UPDATE", entityType: "Tax", entityId: id,
    before: { isActive: tax.isActive }, after: { isActive },
  });
  revalidatePath("/settings/taxes");
  return { ok: true };
}

export async function deleteTaxAction(id: string) {
  const { user, organization } = await requireOrganization();
  const tax = await db.tax.findFirst({ where: { id, organizationId: organization.id } });
  if (!tax) return { ok: false };
  await db.tax.delete({ where: { id } });
  await writeAuditLog({
    organizationId: organization.id, userId: user.id,
    action: "DELETE", entityType: "Tax", entityId: id,
    before: { name: tax.name, rate: tax.rate.toString() },
  });
  revalidatePath("/settings/taxes");
  return { ok: true };
}
