import { DirtyFormProvider, DirtyLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { RecurringForm } from "../recurring-form";
import { createRecurringInvoiceAction } from "../actions";
import type { RecurringInvoiceInput } from "@/lib/validations/recurring-invoice";

export const metadata = { title: "New Recurring Invoice" };

export default async function NewRecurringPage({
  searchParams,
}: {
  searchParams: { fromInvoiceId?: string };
}) {
  const { organization } = await requireOrganization();

  // M17e: pre-fill from a source invoice when ?fromInvoiceId is set.
  // The "Make Recurring" link on the Invoice edit form sends users
  // here.
  const sourceInvoice = searchParams.fromInvoiceId
    ? await db.invoice.findFirst({
        where: {
          id: searchParams.fromInvoiceId,
          organizationId: organization.id,
          deletedAt: null,
        },
        include: { lineItems: true, contact: { select: { displayName: true } } },
      })
    : null;

  const [contacts, items, taxes, paymentTerms, salespeople] = await Promise.all([
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
      select: {
        id: true,
        name: true,
        sellingPrice: true,
        salesDescription: true,
        unit: true,
        // PR #339 — plumb Item Sales Information fields through.
        salesTaxId: true,
        sellingPriceInclusiveOfTax: true,
        salesTax: { select: { rate: true } },
      },
    }),
    db.tax.findMany({
      where: { organizationId: organization.id, isActive: true },
      orderBy: { rate: "asc" },
    }),
    db.paymentTerms.findMany({
      where: { organizationId: organization.id },
      orderBy: { numberOfDays: "asc" },
    }),
    db.salesperson.findMany({
      where: { organizationId: organization.id, isInactive: false },
      orderBy: { name: "asc" },
    }),
  ]);

  async function submit(values: RecurringInvoiceInput) {
    "use server";
    await createRecurringInvoiceAction(values);
  }

  return (
    <DirtyFormProvider>
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <DirtyLink href="/sales/recurring-invoices">
            <ArrowLeft className="h-4 w-4" />
          </DirtyLink>
        </Button>
        <h1 className="text-xl font-semibold">New Recurring Profile</h1>
      </div>
      <RecurringForm
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
          salesTaxId: i.salesTaxId,
          sellingPriceInclusiveOfTax: i.sellingPriceInclusiveOfTax,
          salesTaxRate: i.salesTax?.rate ? Number(i.salesTax.rate) : null,
        }))}
        taxOptions={taxes.map((t) => ({
          value: t.id,
          label: `${t.name} (${Number(t.rate)}%)`,
          rate: Number(t.rate),
        }))}
        paymentTermsOptions={paymentTerms.map((p) => ({ value: p.id, label: p.name }))}
        salespersonOptions={salespeople.map((s) => ({ value: s.id, label: s.name }))}
        onSubmitAction={submit}
        initial={
          sourceInvoice
            ? {
                profileName: `Recurring — Invoice ${sourceInvoice.number}`,
                contactId: sourceInvoice.contactId,
                orderNumber: sourceInvoice.referenceNumber,
                frequency: "MONTHLY",
                intervalN: 1,
                startDate: new Date(),
                neverExpires: true,
                paymentTermsId: sourceInvoice.paymentTermsId,
                salespersonId: sourceInvoice.salespersonId,
                emailAutomatically: true,
                currency: sourceInvoice.currency ?? organization.currency,
                documentDiscount: {
                  value: Number(sourceInvoice.discountValue),
                  type: (sourceInvoice.discountType as
                    | "percentage"
                    | "amount") ?? "percentage",
                },
                adjustmentValue: Number(sourceInvoice.adjustmentValue),
                adjustmentLabel: sourceInvoice.adjustmentLabel ?? "Adjustment",
                customerNotes: sourceInvoice.customerNotes,
                termsAndConditions: sourceInvoice.termsAndConditions,
              }
            : undefined
        }
        initialLines={
          sourceInvoice
            ? sourceInvoice.lineItems.map((l) => ({
                id: l.id,
                itemId: l.itemId,
                name: l.description,
                description: l.description ?? "",
                hsnSacCode: "",
                quantity: l.quantity.toString(),
                unit: "",
                rate: l.rate.toString(),
                discount: "0",
                discountType: "percentage" as const,
                taxId: l.taxId,
              }))
            : undefined
        }
      />
    </div>
    </DirtyFormProvider>
  );
}
