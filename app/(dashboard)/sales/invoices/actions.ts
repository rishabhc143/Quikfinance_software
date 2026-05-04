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
  status: z.enum(["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"]).default("DRAFT"),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  currency: z.string().min(3).max(8).optional().nullable(),
  exchangeRate: z.coerce.number().positive().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  terms: z.string().max(2000).optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

export type InvoiceInput = z.input<typeof schema>;

function totals(lines: { quantity: number; rate: number }[]) {
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.rate, 0);
  return { subtotal, taxTotal: 0, total: subtotal };
}

export async function createInvoiceAction(input: InvoiceInput) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);
  const number = await nextDocumentNumber(organization.id, "invoice");
  const t = totals(data.lines);
  const created = await db.invoice.create({
    data: {
      organizationId: organization.id,
      number,
      contactId: data.contactId,
      status: data.status,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      currency: data.currency ?? null,
      exchangeRate: data.exchangeRate ?? null,
      subtotal: t.subtotal,
      taxTotal: t.taxTotal,
      total: t.total,
      notes: data.notes ?? null,
      terms: data.terms ?? null,
      lineItems: {
        create: data.lines.map((l) => ({
          itemId: l.itemId || null,
          description: l.description,
          quantity: l.quantity,
          rate: l.rate,
          amount: l.quantity * l.rate,
        })),
      },
    },
  });
  await writeAuditLog({
    organizationId: organization.id, userId: user.id,
    action: "CREATE", entityType: "Invoice", entityId: created.id,
    after: { number: created.number, total: t.total },
  });
  revalidatePath("/sales/invoices");
  redirect(`/sales/invoices/${created.id}`);
}

export async function updateInvoiceAction(id: string, input: InvoiceInput) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);
  const before = await db.invoice.findFirst({ where: { id, organizationId: organization.id } });
  if (!before) throw new Error("Not found");
  const t = totals(data.lines);
  await db.$transaction([
    db.invoiceLineItem.deleteMany({ where: { invoiceId: id } }),
    db.invoice.update({
      where: { id },
      data: {
        contactId: data.contactId,
        status: data.status,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        currency: data.currency ?? null,
        exchangeRate: data.exchangeRate ?? null,
        notes: data.notes ?? null,
        terms: data.terms ?? null,
        subtotal: t.subtotal,
        taxTotal: t.taxTotal,
        total: t.total,
        lineItems: {
          create: data.lines.map((l) => ({
            itemId: l.itemId || null,
            description: l.description,
            quantity: l.quantity,
            rate: l.rate,
            amount: l.quantity * l.rate,
          })),
        },
      },
    }),
  ]);
  await writeAuditLog({
    organizationId: organization.id, userId: user.id,
    action: "UPDATE", entityType: "Invoice", entityId: id,
    before: { total: before.total.toString() }, after: { total: t.total },
  });
  revalidatePath("/sales/invoices");
  revalidatePath(`/sales/invoices/${id}`);
  redirect(`/sales/invoices/${id}`);
}

export async function softDeleteInvoiceAction(id: string) {
  const { user, organization } = await requireOrganization();
  const inv = await db.invoice.findFirst({ where: { id, organizationId: organization.id } });
  if (!inv) return { ok: false };
  if (inv.status === "DRAFT") {
    await db.invoice.delete({ where: { id } });
  } else {
    await db.invoice.update({ where: { id }, data: { deletedAt: new Date(), status: "VOID" } });
  }
  await writeAuditLog({
    organizationId: organization.id, userId: user.id,
    action: "DELETE", entityType: "Invoice", entityId: id,
    before: { number: inv.number, status: inv.status },
  });
  revalidatePath("/sales/invoices");
  return { ok: true };
}
