"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  code: z.string().max(20).optional().nullable(),
  name: z.string().min(1).max(120),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE", "COST_OF_GOODS_SOLD", "OTHER_INCOME", "OTHER_EXPENSE"]),
  description: z.string().max(500).optional().nullable(),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return schema.parse({ code: raw.code || null, name: raw.name, type: raw.type, description: raw.description || null });
}

export async function createAccountAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = parse(formData);
  const created = await db.chartOfAccount.create({ data: { organizationId: organization.id, ...data } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "ChartOfAccount", entityId: created.id, after: { name: data.name, type: data.type } });
  revalidatePath("/accountant/chart-of-accounts");
  redirect("/accountant/chart-of-accounts");
}

export async function setAccountActiveAction(id: string, isActive: boolean) {
  const { user, organization } = await requireOrganization();
  const a = await db.chartOfAccount.findFirst({ where: { id, organizationId: organization.id } });
  if (!a) return { ok: false };
  await db.chartOfAccount.update({ where: { id }, data: { isActive } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "UPDATE", entityType: "ChartOfAccount", entityId: id, after: { isActive } });
  revalidatePath("/accountant/chart-of-accounts");
  return { ok: true };
}
