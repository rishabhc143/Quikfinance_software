import { DirtyFormProvider, DirtyLink } from "@/components/shared/dirty-form-nav";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { DebitNoteForm } from "../../debit-note-form";
import { updateDebitNoteAction } from "../../actions";
import type { DebitNoteInput } from "@/lib/validations/debit-note";

export const metadata = { title: "Edit Debit Note" };

export default async function EditDebitNotePage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const dn = await db.debitNote.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: { lineItems: { orderBy: { position: "asc" } } },
  });
  if (!dn) notFound();
  if (dn.status === "VOID") notFound();
  if (Number(dn.amountApplied) > 0) notFound();

  const [contacts, items, taxes, customFieldDefs, customFieldValues] = await Promise.all([
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
    db.customFieldDefinition.findMany({
      where: {
        organizationId: organization.id,
        entityType: "DEBIT_NOTE",
        deletedAt: null,
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    db.customFieldValue.findMany({
      where: {
        organizationId: organization.id,
        entityType: "DEBIT_NOTE",
        entityId: dn.id,
      },
    }),
  ]);

  const initialCustomFieldValues: Record<string, unknown> = Object.fromEntries(
    customFieldValues.map((v) => [v.fieldDefinitionId, v.value])
  );

  const initial: Partial<DebitNoteInput> = {
    contactId: dn.contactId,
    referenceNumber: dn.referenceNumber ?? "",
    debitNoteDate: dn.debitNoteDate,
    reason: dn.reason ?? null,
    currency: dn.currency,
    customerNotes: dn.customerNotes ?? "",
    termsAndConditions: dn.termsAndConditions ?? "",
  };

  const initialLines = dn.lineItems.map((l) => ({
    id: l.id,
    itemId: l.itemId,
    name: l.name,
    description: l.description ?? "",
    hsnSacCode: l.hsnSacCode ?? "",
    quantity: l.quantity.toString(),
    unit: l.unit ?? "",
    rate: l.rate.toString(),
    discount: l.discount.toString(),
    discountType: (l.discountType as "percentage" | "amount") ?? "percentage",
    taxId: l.taxId,
  }));

  async function submit(values: DebitNoteInput) {
    "use server";
    await updateDebitNoteAction(params.id, values);
  }

  return (
    <DirtyFormProvider>
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <DirtyLink href={`/sales/debit-notes/${dn.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </DirtyLink>
        </Button>
        <h1 className="text-xl font-semibold">
          Edit Debit Note {dn.debitNoteNumber}
        </h1>
      </div>
      <DebitNoteForm
        initial={initial}
        initialLines={initialLines}
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
        submitLabel="Update debit note"
        cancelHref={`/sales/debit-notes/${dn.id}`}
      />
    </div>
    </DirtyFormProvider>
  );
}
