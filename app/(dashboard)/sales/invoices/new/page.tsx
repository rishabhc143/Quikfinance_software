import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { InvoiceForm } from "../invoice-form";
import { createInvoiceAction } from "../actions";
import { peekNextDocumentNumber } from "@/lib/sales/numbering";
import type { InvoiceInput } from "@/lib/validations/invoice";

export const metadata = { title: "New Invoice" };

export default async function NewInvoicePage() {
  const { organization } = await requireOrganization();
  const [contacts, items, taxes, salespeople, paymentTerms, nextNumber] = await Promise.all([
    db.contact.findMany({
      where: {
        organizationId: organization.id,
        deletedAt: null,
        type: { in: ["CUSTOMER", "BOTH"] as ("CUSTOMER" | "BOTH")[] },
      },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, email: true, companyName: true },
    }),
    db.item.findMany({
      where: { organizationId: organization.id, deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sellingPrice: true, salesDescription: true, unit: true },
    }),
    db.tax.findMany({
      where: { organizationId: organization.id, isActive: true },
      orderBy: { rate: "asc" },
    }),
    db.salesperson.findMany({
      where: { organizationId: organization.id, isInactive: false },
      orderBy: { name: "asc" },
    }),
    db.paymentTerms.findMany({
      where: { organizationId: organization.id },
      orderBy: { numberOfDays: "asc" },
    }),
    peekNextDocumentNumber(organization.id, "INVOICE"),
  ]);

  async function submit(values: InvoiceInput, opts?: { send?: boolean }) {
    "use server";
    await createInvoiceAction(values, opts);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link href="/sales/invoices">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">New Invoice</h1>
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Close">
          <Link href="/sales/invoices">
            <X className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      <InvoiceForm
        nextNumber={nextNumber}
        defaultCurrency={organization.currency}
        contactOptions={contacts.map((c) => ({
          value: c.id,
          label: c.displayName,
          hint: c.email ?? c.companyName ?? undefined,
        }))}
        itemOptions={items.map((i) => ({
          value: i.id,
          label: i.name,
          rate: i.sellingPrice ? String(i.sellingPrice) : "0",
          description: i.salesDescription ?? undefined,
          unit: i.unit ?? undefined,
        }))}
        taxOptions={taxes.map((t) => ({
          value: t.id,
          label: `${t.name} (${Number(t.rate)}%)`,
          rate: Number(t.rate),
        }))}
        salespersonOptions={salespeople.map((s) => ({ value: s.id, label: s.name }))}
        paymentTermsOptions={paymentTerms.map((p) => ({
          value: p.id,
          label: p.name,
          numberOfDays: p.numberOfDays,
        }))}
        onSubmitAction={submit}
        submitLabel="Save as Draft"
      />
    </div>
  );
}
