import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { QuoteForm } from "../quote-form";
import { createQuoteAction } from "../actions";
import {
  createSalespersonInlineAction,
  createCustomerInlineAction,
} from "../../_inline-create/actions";
import { peekNextDocumentNumber } from "@/lib/sales/numbering";
import type { QuoteInput } from "@/lib/validations/quote";

export const metadata = { title: "New Quote" };

export default async function NewQuotePage() {
  const { organization } = await requireOrganization();
  const [contacts, items, taxes, salespeople, pdfTemplates, nextNumber] = await Promise.all([
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
    peekNextDocumentNumber(organization.id, "QUOTE"),
  ]);

  async function submit(values: QuoteInput, opts?: { send?: boolean }) {
    "use server";
    await createQuoteAction(values, opts);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link href="/sales/quotes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">New Quote</h1>
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Close">
          <Link href="/sales/quotes">
            <X className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      <QuoteForm
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
        pdfTemplateOptions={pdfTemplates.map((t) => ({ value: t.id, label: t.name }))}
        createSalesperson={createSalespersonInlineAction}
        createCustomer={createCustomerInlineAction}
        onSubmitAction={submit}
        submitLabel="Save as Draft"
      />
    </div>
  );
}
