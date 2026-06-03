import { DirtyFormProvider, DirtyLink } from "@/components/shared/dirty-form-nav";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { InvoiceForm } from "../../invoice-form";
import { updateInvoiceAction } from "../../actions";
import type { InvoiceInput } from "@/lib/validations/invoice";

export const metadata = { title: "Edit Invoice" };

export default async function EditInvoicePage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const inv = await db.invoice.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: { lineItems: true },
  });
  if (!inv) notFound();
  if (inv.status === "PAID" || inv.status === "VOID" || inv.status === "WRITTEN_OFF") {
    notFound();
  }

  const [contacts, items, taxes, salespeople, paymentTerms, pdfTemplates, customFieldDefs, customFieldValues] = await Promise.all([
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
    db.salesperson.findMany({
      where: { organizationId: organization.id, isInactive: false },
      orderBy: { name: "asc" },
    }),
    db.paymentTerms.findMany({
      where: { organizationId: organization.id },
      orderBy: { numberOfDays: "asc" },
    }),
    db.pdfTemplate.findMany({
      where: { organizationId: organization.id, documentType: "INVOICE" },
      orderBy: { name: "asc" },
    }),
    db.customFieldDefinition.findMany({
      where: {
        organizationId: organization.id,
        entityType: "INVOICE",
        deletedAt: null,
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    db.customFieldValue.findMany({
      where: {
        organizationId: organization.id,
        entityType: "INVOICE",
        entityId: inv.id,
      },
    }),
  ]);

  const initialCustomFieldValues: Record<string, unknown> = Object.fromEntries(
    customFieldValues.map((v) => [v.fieldDefinitionId, v.value])
  );

  const initial: Partial<InvoiceInput> = {
    contactId: inv.contactId,
    referenceNumber: inv.referenceNumber ?? "",
    invoiceDate: inv.issueDate,
    dueDate: inv.dueDate,
    paymentTermsId: inv.paymentTermsId,
    salespersonId: inv.salespersonId,
    projectId: inv.projectId,
    status: inv.status,
    currency: inv.currency ?? organization.currency,
    documentDiscount: {
      value: Number(inv.discountValue),
      type: (inv.discountType as "percentage" | "amount") ?? "percentage",
    },
    adjustmentLabel: inv.adjustmentLabel ?? "Adjustment",
    adjustmentValue: Number(inv.adjustmentValue),
    customerNotes: inv.customerNotes ?? inv.notes ?? "",
    termsAndConditions: inv.termsAndConditions ?? inv.terms ?? "",
  };

  const initialLines = inv.lineItems.map((l) => ({
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
  }));

  async function submit(values: InvoiceInput) {
    "use server";
    await updateInvoiceAction(params.id, values);
  }

  return (
    <DirtyFormProvider>
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <DirtyLink href={`/sales/invoices/${inv.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </DirtyLink>
        </Button>
        <h1 className="text-xl font-semibold">Edit Invoice {inv.number}</h1>
      </div>
      <InvoiceForm
        initial={initial}
        initialLines={initialLines}
        nextNumber={inv.number}
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
          type: t.type ?? "standard",
        }))}
        salespersonOptions={salespeople.map((s) => ({ value: s.id, label: s.name }))}
        paymentTermsOptions={paymentTerms.map((p) => ({
          value: p.id,
          label: p.name,
          numberOfDays: p.numberOfDays,
        }))}
        pdfTemplateOptions={pdfTemplates.map((t) => ({ value: t.id, label: t.name }))}
        customFieldDefinitions={customFieldDefs.map((d) => ({
          id: d.id,
          fieldKey: d.fieldKey,
          label: d.label,
          dataType: d.dataType as
            | "text"
            | "number"
            | "date"
            | "dropdown"
            | "checkbox"
            | "email"
            | "url",
          options:
            (d.options as { label: string; value: string }[] | null) ?? null,
          isRequired: d.isRequired,
        }))}
        customFieldInitialValues={initialCustomFieldValues}
        existingInvoiceId={inv.id}
        onSubmitAction={submit}
        submitLabel="Update invoice"
        cancelHref={`/sales/invoices/${inv.id}`}
      />
    </div>
    </DirtyFormProvider>
  );
}
