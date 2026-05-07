import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { QuoteForm } from "../../quote-form";
import { updateQuoteAction } from "../../actions";
import type { QuoteInput } from "@/lib/validations/quote";

export const metadata = { title: "Edit Quote" };

export default async function EditQuotePage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrganization();
  const q = await db.quote.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: { lineItems: { orderBy: { position: "asc" } } },
  });
  if (!q) notFound();
  if (q.status === "INVOICED") {
    notFound();
  }

  const [contacts, items, taxes, salespeople, pdfTemplates, customFieldDefs, customFieldValues] = await Promise.all([
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
    db.pdfTemplate.findMany({
      where: { organizationId: organization.id, documentType: "QUOTE" },
      orderBy: { name: "asc" },
    }),
    db.customFieldDefinition.findMany({
      where: {
        organizationId: organization.id,
        entityType: "QUOTE",
        deletedAt: null,
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    db.customFieldValue.findMany({
      where: {
        organizationId: organization.id,
        entityType: "QUOTE",
        entityId: q.id,
      },
    }),
  ]);

  const initialCustomFieldValues: Record<string, unknown> = Object.fromEntries(
    customFieldValues.map((v) => [v.fieldDefinitionId, v.value])
  );

  const initial: Partial<QuoteInput> = {
    contactId: q.contactId,
    referenceNumber: q.referenceNumber ?? "",
    quoteDate: q.issueDate,
    expiryDate: q.expiryDate,
    salespersonId: q.salespersonId,
    subject: q.subject ?? "",
    status: q.status,
    currency: q.currency,
    documentDiscount: {
      value: Number(q.discountValue),
      type: (q.discountType as "percentage" | "amount") ?? "percentage",
    },
    adjustmentLabel: q.adjustmentLabel ?? "Adjustment",
    adjustmentValue: Number(q.adjustmentValue),
    customerNotes: q.customerNotes ?? "",
    termsAndConditions: q.termsAndConditions ?? "",
  };

  const initialLines = q.lineItems.map((l) => ({
    id: l.id,
    itemId: l.itemId,
    name: l.name,
    description: l.description ?? "",
    hsnSacCode: l.hsnSacCode ?? "",
    quantity: l.quantity.toString(),
    unit: l.unit ?? "",
    rate: l.rate.toString(),
    discount: l.discount.toString(),
    discountType: l.discountType as "percentage" | "amount",
    taxId: l.taxId,
  }));

  async function submit(values: QuoteInput) {
    "use server";
    await updateQuoteAction(params.id, values);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href={`/sales/quotes/${q.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Edit Quote {q.number}</h1>
      </div>
      <QuoteForm
        initial={initial}
        initialLines={initialLines}
        nextNumber={q.number}
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
        onSubmitAction={submit}
        submitLabel="Update quote"
        cancelHref={`/sales/quotes/${q.id}`}
      />
    </div>
  );
}
