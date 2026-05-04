import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { InvoiceForm, type InvoiceFormValues } from "../invoice-form";
import { createInvoiceAction } from "../actions";

export const metadata = { title: "New Invoice" };

export default async function NewInvoicePage() {
  const { organization } = await requireOrganization();
  const [contacts, items] = await Promise.all([
    db.contact.findMany({
      where: { organizationId: organization.id, deletedAt: null, type: { in: ["CUSTOMER", "BOTH"] } },
      orderBy: { displayName: "asc" }, select: { id: true, displayName: true },
    }),
    db.item.findMany({
      where: { organizationId: organization.id, deletedAt: null, isActive: true },
      orderBy: { name: "asc" }, select: { id: true, name: true, sellingPrice: true, salesDescription: true },
    }),
  ]);

  async function submit(values: InvoiceFormValues) {
    "use server";
    if (!values.contactId) throw new Error("Customer required");
    await createInvoiceAction({
      contactId: values.contactId,
      status: values.status,
      issueDate: new Date(values.issueDate),
      dueDate: new Date(values.dueDate),
      notes: values.notes || null,
      terms: values.terms || null,
      lines: values.lines,
    });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/sales/invoices"><ArrowLeft className="h-4 w-4" /></Link></Button>
      </div>
      <InvoiceForm
        currency={organization.currency}
        contactOptions={contacts.map((c) => ({ value: c.id, label: c.displayName }))}
        itemOptions={items.map((i) => ({ value: i.id, label: i.name, sellingPrice: i.sellingPrice ? Number(i.sellingPrice) : null, description: i.salesDescription ?? null }))}
        onSubmit={submit}
        submitLabel="Create invoice"
      />
    </div>
  );
}
