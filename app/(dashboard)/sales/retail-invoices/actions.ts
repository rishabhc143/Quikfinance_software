"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/next-number";

const schema = z.object({
  customerName: z.string().min(1).max(120),
  date: z.coerce.date(),
  total: z.coerce.number().positive(),
  description: z.string().max(500).optional().nullable(),
});

export async function createRetailInvoiceAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({
    customerName: formData.get("customerName"),
    date: formData.get("date"),
    total: formData.get("total"),
    description: formData.get("description") || null,
  });

  // Walk-in / cash invoice: create or reuse a single "Walk-in Customer" Contact.
  let walkin = await db.contact.findFirst({
    where: { organizationId: organization.id, displayName: "Walk-in Customer" },
  });
  if (!walkin) {
    walkin = await db.contact.create({
      data: { organizationId: organization.id, type: "CUSTOMER", displayName: "Walk-in Customer" },
    });
  }

  const number = await nextDocumentNumber(organization.id, "invoice");
  const created = await db.invoice.create({
    data: {
      organizationId: organization.id,
      number, contactId: walkin.id,
      status: "PAID",                // retail = cash, paid on the spot
      isRetail: true,
      issueDate: data.date, dueDate: data.date,
      subtotal: data.total, taxTotal: 0, total: data.total, amountPaid: data.total,
      notes: data.description ? `${data.customerName} · ${data.description}` : data.customerName,
      lineItems: { create: [{ description: data.description ?? `Retail sale to ${data.customerName}`, quantity: 1, rate: data.total, amount: data.total }] },
    },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "RetailInvoice", entityId: created.id, after: { number, customer: data.customerName, total: data.total } });
  revalidatePath("/sales/retail-invoices");
  revalidatePath("/sales/invoices");
  redirect("/sales/retail-invoices");
}
