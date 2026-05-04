"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  type: z.enum(["CUSTOMER", "VENDOR", "BOTH"]),
  displayName: z.string().min(1).max(200),
  companyName: z.string().max(200).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(40).optional().nullable(),
  billingAddress: z.string().max(2000).optional().nullable(),
  shippingAddress: z.string().max(2000).optional().nullable(),
  taxId: z.string().max(80).optional().nullable(),
  currency: z.string().max(8).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const cleaned = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v === "" ? null : v]));
  return schema.parse({ ...cleaned, type: raw.type ?? "CUSTOMER", displayName: raw.displayName });
}

export async function createContactAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = parse(formData);
  const created = await db.contact.create({
    data: { organizationId: organization.id, ...data, email: data.email || null },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Contact", entityId: created.id, after: { displayName: created.displayName, type: created.type } });
  revalidatePath("/contacts");
  redirect(`/contacts/${created.id}`);
}

export async function updateContactAction(id: string, formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = parse(formData);
  const before = await db.contact.findFirst({ where: { id, organizationId: organization.id } });
  if (!before) throw new Error("Not found");
  await db.contact.update({ where: { id }, data: { ...data, email: data.email || null } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "UPDATE", entityType: "Contact", entityId: id, before: { displayName: before.displayName }, after: { displayName: data.displayName } });
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  redirect(`/contacts/${id}`);
}

export async function softDeleteContactAction(id: string) {
  const { user, organization } = await requireOrganization();
  const c = await db.contact.findFirst({ where: { id, organizationId: organization.id } });
  if (!c) return { ok: false };
  await db.contact.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Contact", entityId: id, before: { displayName: c.displayName } });
  revalidatePath("/contacts");
  return { ok: true };
}
