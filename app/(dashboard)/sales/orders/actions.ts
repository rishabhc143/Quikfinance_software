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
export type SalesOrderInput = z.input<typeof schema>;

export async function createSalesOrderAction(input: SalesOrderInput) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);
  const number = await nextDocumentNumber(organization.id, "salesOrder");
  const created = await db.salesOrder.create({
    data: { organizationId: organization.id, number, contactId: data.contactId, status: data.status, orderDate: data.date, total: data.total },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "SalesOrder", entityId: created.id, after: { number: created.number, total: data.total } });
  revalidatePath("/sales/orders");
  redirect("/sales/orders");
}

export async function deleteSalesOrderAction(id: string) {
  const { user, organization } = await requireOrganization();
  const so = await db.salesOrder.findFirst({ where: { id, organizationId: organization.id } });
  if (!so) return { ok: false };
  await db.salesOrder.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "SalesOrder", entityId: id, before: { number: so.number } });
  revalidatePath("/sales/orders");
  return { ok: true };
}
