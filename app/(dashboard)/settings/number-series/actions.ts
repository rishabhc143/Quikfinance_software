"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const addSchema = z.object({
  module: z.string().min(1).max(40),
  prefix: z.string().min(1).max(10),
});
const updateSchema = z.object({
  prefix: z.string().min(1).max(10),
  nextValue: z.coerce.number().int().min(1),
  padding: z.coerce.number().int().min(0).max(10),
});

export async function addSeriesAction(input: z.input<typeof addSchema>) {
  const { user, organization } = await requireOrganization();
  const data = addSchema.parse(input);
  const exists = await db.numberSeries.findUnique({ where: { organizationId_module: { organizationId: organization.id, module: data.module } } });
  if (exists) throw new Error("That module already has a series.");
  const created = await db.numberSeries.create({
    data: { organizationId: organization.id, module: data.module, prefix: data.prefix, nextValue: 1, padding: 5 },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "NumberSeries", entityId: created.id, after: data });
  revalidatePath("/settings/number-series");
  return { ok: true };
}

export async function updateSeriesAction(id: string, input: z.input<typeof updateSchema>) {
  const { user, organization } = await requireOrganization();
  const data = updateSchema.parse(input);
  const existing = await db.numberSeries.findFirst({ where: { id, organizationId: organization.id } });
  if (!existing) throw new Error("Series not found");
  await db.numberSeries.update({ where: { id }, data });
  await writeAuditLog({
    organizationId: organization.id, userId: user.id,
    action: "UPDATE", entityType: "NumberSeries", entityId: id,
    before: { prefix: existing.prefix, nextValue: existing.nextValue, padding: existing.padding },
    after: data,
  });
  revalidatePath("/settings/number-series");
  return { ok: true };
}

export async function deleteSeriesAction(id: string) {
  const { user, organization } = await requireOrganization();
  const existing = await db.numberSeries.findFirst({ where: { id, organizationId: organization.id } });
  if (!existing) return { ok: false };
  await db.numberSeries.delete({ where: { id } });
  await writeAuditLog({
    organizationId: organization.id, userId: user.id,
    action: "DELETE", entityType: "NumberSeries", entityId: id,
    before: { module: existing.module, prefix: existing.prefix },
  });
  revalidatePath("/settings/number-series");
  return { ok: true };
}
