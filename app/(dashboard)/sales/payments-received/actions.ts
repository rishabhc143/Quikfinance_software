"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/next-number";

const allocSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive(),
});

const schema = z.object({
  contactId: z.string().min(1),
  paymentDate: z.coerce.date(),
  method: z.string().max(40).optional().nullable(),
  reference: z.string().max(120).optional().nullable(),
  bankAccountId: z.string().nullable().optional(),
  notes: z.string().max(2000).optional().nullable(),
  allocations: z.array(allocSchema).min(1),
});

export type PaymentReceivedInput = z.input<typeof schema>;

export async function createPaymentReceivedAction(input: PaymentReceivedInput) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);
  const number = await nextDocumentNumber(organization.id, "paymentReceived");
  const totalAmount = data.allocations.reduce((s, a) => s + a.amount, 0);

  const created = await db.$transaction(async (tx) => {
    // Verify all invoices belong to this org and customer
    const invoices = await tx.invoice.findMany({
      where: { id: { in: data.allocations.map((a) => a.invoiceId) }, organizationId: organization.id, contactId: data.contactId, deletedAt: null },
    });
    if (invoices.length !== data.allocations.length) throw new Error("Some invoices not found or don't belong to this customer");
    for (const alloc of data.allocations) {
      const inv = invoices.find((i) => i.id === alloc.invoiceId)!;
      const outstanding = Number(inv.total) - Number(inv.amountPaid);
      if (alloc.amount > outstanding + 0.001) throw new Error(`Cannot allocate ${alloc.amount} to ${inv.number}; only ${outstanding.toFixed(2)} outstanding`);
    }

    const payment = await tx.paymentReceived.create({
      data: {
        organizationId: organization.id, number,
        contactId: data.contactId, paymentDate: data.paymentDate,
        amount: totalAmount,
        method: data.method ?? null, reference: data.reference ?? null,
        bankAccountId: data.bankAccountId ?? null, notes: data.notes ?? null,
        allocations: { create: data.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })) },
      },
    });

    // Apply allocations to invoices: bump amountPaid + maybe flip status to PAID/PARTIALLY_PAID
    for (const alloc of data.allocations) {
      const inv = invoices.find((i) => i.id === alloc.invoiceId)!;
      const newPaid = Number(inv.amountPaid) + alloc.amount;
      const total = Number(inv.total);
      const status = newPaid >= total - 0.001 ? "PAID" : "PARTIALLY_PAID";
      await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: newPaid, status } });
    }

    return payment;
  });

  await writeAuditLog({
    organizationId: organization.id, userId: user.id,
    action: "CREATE", entityType: "PaymentReceived", entityId: created.id,
    after: { number: created.number, amount: totalAmount },
  });
  revalidatePath("/sales/payments-received");
  revalidatePath("/sales/invoices");
  revalidatePath("/");
  redirect(`/sales/payments-received/${created.id}`);
}

export async function deletePaymentReceivedAction(id: string) {
  const { user, organization } = await requireOrganization();
  const payment = await db.paymentReceived.findFirst({
    where: { id, organizationId: organization.id },
    include: { allocations: true },
  });
  if (!payment) return { ok: false };

  await db.$transaction(async (tx) => {
    // Reverse allocations
    for (const alloc of payment.allocations) {
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id: alloc.invoiceId } });
      const newPaid = Math.max(0, Number(inv.amountPaid) - Number(alloc.amount));
      const total = Number(inv.total);
      const status = newPaid <= 0.001 ? "SENT" : newPaid >= total - 0.001 ? "PAID" : "PARTIALLY_PAID";
      await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: newPaid, status } });
    }
    await tx.paymentReceived.delete({ where: { id } });
  });

  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "PaymentReceived", entityId: id, before: { number: payment.number } });
  revalidatePath("/sales/payments-received");
  revalidatePath("/sales/invoices");
  return { ok: true };
}
