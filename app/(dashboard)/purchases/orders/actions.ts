"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/next-number";

const schema = z.object({
  contactId: z.string().min(1),
  date: z.coerce.date(),
  total: z.coerce.number().nonnegative(),
  status: z.string().min(1),
});
export type PurchaseOrderInput = z.input<typeof schema>;

export async function createPurchaseOrderAction(input: PurchaseOrderInput) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);
  const number = await nextDocumentNumber(organization.id, "purchaseOrder");
  const created = await db.purchaseOrder.create({
    data: { organizationId: organization.id, number, contactId: data.contactId, status: data.status, orderDate: data.date, total: data.total },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "PurchaseOrder", entityId: created.id, after: { number, total: data.total } });
  revalidatePath("/purchases/orders");
  redirect("/purchases/orders");
}

export async function deletePurchaseOrderAction(id: string) {
  const { user, organization } = await requireOrganization();
  const po = await db.purchaseOrder.findFirst({ where: { id, organizationId: organization.id } });
  if (!po) return { ok: false };
  await db.purchaseOrder.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "PurchaseOrder", entityId: id, before: { number: po.number } });
  revalidatePath("/purchases/orders");
  return { ok: true };
}
