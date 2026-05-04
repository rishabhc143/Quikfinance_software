"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/next-number";

const schema = z.object({
  contactId: z.string().nullable().optional(),
  date: z.coerce.date(),
  status: z.string().default("draft"),
});

export async function createDeliveryChallanAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({
    contactId: formData.get("contactId") || null,
    date: formData.get("date"),
    status: formData.get("status") || "draft",
  });
  const number = await nextDocumentNumber(organization.id, "deliveryChallan");
  const created = await db.deliveryChallan.create({
    data: { organizationId: organization.id, number, contactId: data.contactId ?? null, date: data.date, status: data.status },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "DeliveryChallan", entityId: created.id, after: { number } });
  revalidatePath("/sales/delivery-challans");
  redirect("/sales/delivery-challans");
}

export async function deleteDeliveryChallanAction(id: string) {
  const { user, organization } = await requireOrganization();
  const dc = await db.deliveryChallan.findFirst({ where: { id, organizationId: organization.id } });
  if (!dc) return { ok: false };
  await db.deliveryChallan.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "DeliveryChallan", entityId: id, before: { number: dc.number } });
  revalidatePath("/sales/delivery-challans");
  return { ok: true };
}
