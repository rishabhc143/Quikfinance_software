"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(120),
  customerId: z.string().nullable().optional(),
  status: z.enum(["active", "on_hold", "completed", "archived"]).default("active"),
  budget: z.coerce.number().nonnegative().optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return schema.parse({
    name: raw.name,
    customerId: raw.customerId === "" ? null : raw.customerId,
    status: raw.status || "active",
    budget: raw.budget === "" ? null : raw.budget,
    startDate: raw.startDate || null,
    endDate: raw.endDate || null,
  });
}

export async function createProjectAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = parse(formData);
  const created = await db.project.create({ data: { organizationId: organization.id, ...data, customerId: data.customerId ?? null } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Project", entityId: created.id, after: { name: data.name } });
  revalidatePath("/time/projects");
  redirect("/time/projects");
}

export async function deleteProjectAction(id: string) {
  const { user, organization } = await requireOrganization();
  const p = await db.project.findFirst({ where: { id, organizationId: organization.id } });
  if (!p) return { ok: false };
  await db.project.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Project", entityId: id, before: { name: p.name } });
  revalidatePath("/time/projects");
  return { ok: true };
}
