"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/next-number";

const lineSchema = z.object({
  itemId: z.string().nullable().optional(),
  description: z.string().min(1).max(500),
  quantity: z.coerce.number().nonnegative(),
  rate: z.coerce.number().nonnegative(),
});

const schema = z.object({
  contactId: z.string().min(1),
  status: z.enum(["DRAFT", "OPEN", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"]).default("DRAFT"),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(lineSchema).min(1),
});
export type BillInput = z.input<typeof schema>;

function totals(lines: { quantity: number; rate: number }[]) {
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.rate, 0);
  return { subtotal, taxTotal: 0, total: subtotal };
}

export async function createBillAction(input: BillInput) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);
  const number = await nextDocumentNumber(organization.id, "bill");
  const t = totals(data.lines);
  const created = await db.bill.create({
    data: {
      organizationId: organization.id, number, contactId: data.contactId, status: data.status,
      issueDate: data.issueDate, dueDate: data.dueDate, notes: data.notes ?? null,
      subtotal: t.subtotal, taxTotal: t.taxTotal, total: t.total,
      lineItems: { create: data.lines.map((l) => ({ itemId: l.itemId || null, description: l.description, quantity: l.quantity, rate: l.rate, amount: l.quantity * l.rate })) },
    },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Bill", entityId: created.id, after: { number: created.number, total: t.total } });
  revalidatePath("/purchases/bills");
  redirect(`/purchases/bills/${created.id}`);
}

export async function updateBillAction(id: string, input: BillInput) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);
  const before = await db.bill.findFirst({ where: { id, organizationId: organization.id } });
  if (!before) throw new Error("Not found");
  const t = totals(data.lines);
  await db.$transaction([
    db.billLineItem.deleteMany({ where: { billId: id } }),
    db.bill.update({
      where: { id },
      data: {
        contactId: data.contactId, status: data.status, issueDate: data.issueDate, dueDate: data.dueDate,
        notes: data.notes ?? null, subtotal: t.subtotal, taxTotal: t.taxTotal, total: t.total,
        lineItems: { create: data.lines.map((l) => ({ itemId: l.itemId || null, description: l.description, quantity: l.quantity, rate: l.rate, amount: l.quantity * l.rate })) },
      },
    }),
  ]);
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "UPDATE", entityType: "Bill", entityId: id, before: { total: before.total.toString() }, after: { total: t.total } });
  revalidatePath("/purchases/bills");
  revalidatePath(`/purchases/bills/${id}`);
  redirect(`/purchases/bills/${id}`);
}

export async function softDeleteBillAction(id: string) {
  const { user, organization } = await requireOrganization();
  const b = await db.bill.findFirst({ where: { id, organizationId: organization.id } });
  if (!b) return { ok: false };
  if (b.status === "DRAFT") {
    await db.bill.delete({ where: { id } });
  } else {
    await db.bill.update({ where: { id }, data: { deletedAt: new Date(), status: "VOID" } });
  }
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Bill", entityId: id, before: { number: b.number, status: b.status } });
  revalidatePath("/purchases/bills");
  return { ok: true };
}
