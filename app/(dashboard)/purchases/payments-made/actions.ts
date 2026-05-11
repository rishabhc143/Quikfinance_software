"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/next-number";

const allocSchema = z.object({ billId: z.string().min(1), amount: z.coerce.number().positive() });
const schema = z.object({
  contactId: z.string().min(1),
  paymentDate: z.coerce.date(),
  method: z.string().max(40).optional().nullable(),
  reference: z.string().max(120).optional().nullable(),
  bankAccountId: z.string().nullable().optional(),
  notes: z.string().max(2000).optional().nullable(),
  allocations: z.array(allocSchema).min(1),
});
export type PaymentMadeInput = z.input<typeof schema>;

export async function createPaymentMadeAction(input: PaymentMadeInput) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);
  const number = await nextDocumentNumber(organization.id, "paymentMade");
  const totalAmount = data.allocations.reduce((s, a) => s + a.amount, 0);

  const created = await db.$transaction(async (tx) => {
    const bills = await tx.bill.findMany({
      where: { id: { in: data.allocations.map((a) => a.billId) }, organizationId: organization.id, contactId: data.contactId, deletedAt: null },
    });
    if (bills.length !== data.allocations.length) throw new Error("Some bills not found or don't belong to this vendor");
    for (const alloc of data.allocations) {
      const b = bills.find((x) => x.id === alloc.billId)!;
      const outstanding = Number(b.total) - Number(b.amountPaid);
      if (alloc.amount > outstanding + 0.001) throw new Error(`Cannot allocate ${alloc.amount} to ${b.number}; only ${outstanding.toFixed(2)} outstanding`);
    }
    const payment = await tx.paymentMade.create({
      data: {
        organizationId: organization.id, number,
        contactId: data.contactId, paymentDate: data.paymentDate, amount: totalAmount,
        method: data.method ?? null, reference: data.reference ?? null,
        bankAccountId: data.bankAccountId ?? null, notes: data.notes ?? null,
        allocations: { create: data.allocations.map((a) => ({ billId: a.billId, amount: a.amount })) },
      },
    });
    for (const alloc of data.allocations) {
      const b = bills.find((x) => x.id === alloc.billId)!;
      const newPaid = Number(b.amountPaid) + alloc.amount;
      const total = Number(b.total);
      const status = newPaid >= total - 0.001 ? "PAID" : "PARTIALLY_PAID";
      await tx.bill.update({ where: { id: b.id }, data: { amountPaid: newPaid, status } });
    }
    return payment;
  });

  await writeAuditLog({
    organizationId: organization.id, userId: user.id,
    action: "CREATE", entityType: "PaymentMade", entityId: created.id,
    after: { number: created.number, amount: totalAmount },
  });
  revalidatePath("/purchases/payments-made");
  revalidatePath("/purchases/bills");
  revalidatePath("/");
  redirect(`/purchases/payments-made/${created.id}`);
}

/**
 * Bulk delete payments. For each payment, reverse the allocation
 * impact on every Bill: subtract the allocated amount from
 * `amountPaid`, flip the bill's status back to OPEN or
 * PARTIALLY_PAID accordingly. Soft-deletes the PaymentMade row
 * (preserves the audit trail; recoverable by clearing deletedAt).
 *
 * Returns { ok, updated, error } shape for BulkAwareDataTable.
 */
export async function bulkDeletePaymentsMadeAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };

  const payments = await db.paymentMade.findMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    include: { allocations: true },
  });
  if (payments.length === 0) return { ok: true, updated: 0 };

  let updatedCount = 0;
  await db.$transaction(async (tx) => {
    for (const p of payments) {
      // Reverse each allocation onto the affected Bill.
      for (const a of p.allocations) {
        const b = await tx.bill.findUnique({ where: { id: a.billId } });
        if (!b) continue;
        const newPaid = Math.max(
          0,
          Number(b.amountPaid) - Number(a.amount)
        );
        const total = Number(b.total);
        const status =
          newPaid <= 0.001
            ? "OPEN"
            : newPaid >= total - 0.001
            ? "PAID"
            : "PARTIALLY_PAID";
        await tx.bill.update({
          where: { id: b.id },
          data: { amountPaid: newPaid, status },
        });
      }
      // Soft-delete the payment + its allocations.
      await tx.paymentMadeAllocation.deleteMany({
        where: { paymentMadeId: p.id },
      });
      await tx.paymentMade.update({
        where: { id: p.id },
        data: { deletedAt: new Date() },
      });
      updatedCount += 1;
    }
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "PaymentMade",
    entityId: `bulk-delete-${Date.now()}`,
    before: { count: updatedCount, ids: input.ids },
  });
  revalidatePath("/purchases/payments-made");
  revalidatePath("/purchases/bills");
  return { ok: true, updated: updatedCount };
}

export async function deletePaymentMadeAction(id: string) {
  const { user, organization } = await requireOrganization();
  const payment = await db.paymentMade.findFirst({
    where: { id, organizationId: organization.id }, include: { allocations: true },
  });
  if (!payment) return { ok: false };
  await db.$transaction(async (tx) => {
    for (const alloc of payment.allocations) {
      const b = await tx.bill.findUniqueOrThrow({ where: { id: alloc.billId } });
      const newPaid = Math.max(0, Number(b.amountPaid) - Number(alloc.amount));
      const total = Number(b.total);
      const status = newPaid <= 0.001 ? "OPEN" : newPaid >= total - 0.001 ? "PAID" : "PARTIALLY_PAID";
      await tx.bill.update({ where: { id: b.id }, data: { amountPaid: newPaid, status } });
    }
    await tx.paymentMade.delete({ where: { id } });
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "PaymentMade", entityId: id, before: { number: payment.number } });
  revalidatePath("/purchases/payments-made");
  revalidatePath("/purchases/bills");
  return { ok: true };
}
