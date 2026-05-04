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
  status: z.string().default("draft"),
  issueDate: z.coerce.date(),
  expiryDate: z.coerce.date().optional().nullable(),
  total: z.coerce.number().nonnegative(),
});

export async function createQuoteAction(input: z.input<typeof schema>) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);
  const number = await nextDocumentNumber(organization.id, "quote");
  const created = await db.quote.create({
    data: { organizationId: organization.id, number, contactId: data.contactId, status: data.status, issueDate: data.issueDate, expiryDate: data.expiryDate ?? null, total: data.total },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Quote", entityId: created.id, after: { number: created.number, total: data.total } });
  revalidatePath("/sales/quotes");
  redirect(`/sales/quotes`);
}

export async function convertQuoteToInvoiceAction(quoteId: string) {
  const { user, organization } = await requireOrganization();
  const q = await db.quote.findFirst({ where: { id: quoteId, organizationId: organization.id } });
  if (!q) throw new Error("Quote not found");

  const invoiceNumber = await nextDocumentNumber(organization.id, "invoice");
  const total = Number(q.total);
  const created = await db.invoice.create({
    data: {
      organizationId: organization.id, number: invoiceNumber, contactId: q.contactId,
      status: "SENT", issueDate: new Date(), dueDate: new Date(Date.now() + 30 * 86400000),
      subtotal: total, taxTotal: 0, total,
      lineItems: { create: [{ description: `Converted from quote ${q.number}`, quantity: 1, rate: total, amount: total }] },
    },
  });
  await db.quote.update({ where: { id: quoteId }, data: { status: "accepted" } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Invoice", entityId: created.id, after: { number: created.number, fromQuote: q.number } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "UPDATE", entityType: "Quote", entityId: q.id, before: { status: q.status }, after: { status: "accepted" } });
  revalidatePath("/sales/quotes");
  revalidatePath("/sales/invoices");
  redirect(`/sales/invoices/${created.id}`);
}

export async function deleteQuoteAction(id: string) {
  const { user, organization } = await requireOrganization();
  const q = await db.quote.findFirst({ where: { id, organizationId: organization.id } });
  if (!q) return { ok: false };
  await db.quote.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Quote", entityId: id, before: { number: q.number } });
  revalidatePath("/sales/quotes");
  return { ok: true };
}
