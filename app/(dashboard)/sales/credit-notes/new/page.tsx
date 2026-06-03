import { DirtyFormProvider, DirtyLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { CreditNoteForm } from "../credit-note-form";
import { createCreditNoteAction } from "../actions";
import type { CreditNoteInput } from "@/lib/validations/credit-note";

export const metadata = { title: "New Credit Note" };

export default async function NewCreditNotePage() {
  const { organization } = await requireOrganization();
  const [contacts, items, taxes, pdfTemplates] = await Promise.all([
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
    db.pdfTemplate.findMany({
      where: { organizationId: organization.id, documentType: "CREDIT_NOTE" },
      orderBy: { name: "asc" },
    }),
  ]);

  async function submit(values: CreditNoteInput) {
    "use server";
    await createCreditNoteAction(values);
  }

  return (
    <DirtyFormProvider>
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <DirtyLink href="/sales/credit-notes">
            <ArrowLeft className="h-4 w-4" />
          </DirtyLink>
        </Button>
        <h1 className="text-xl font-semibold">New Credit Note</h1>
      </div>
      <CreditNoteForm
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
        pdfTemplateOptions={pdfTemplates.map((t) => ({ value: t.id, label: t.name }))}
        onSubmitAction={submit}
      />
    </div>
    </DirtyFormProvider>
  );
}
