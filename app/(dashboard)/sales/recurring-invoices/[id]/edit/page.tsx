import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { RecurringForm } from "../../recurring-form";
import { updateRecurringInvoiceAction } from "../../actions";
import type { RecurringInvoiceInput } from "@/lib/validations/recurring-invoice";

export const metadata = { title: "Edit Recurring Invoice" };

export default async function EditRecurringPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const r = await db.recurringInvoice.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
  });
  if (!r) notFound();

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
      select: { id: true, name: true, sellingPrice: true, salesDescription: true, unit: true },
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

  type TemplateLine = {
    itemId: string | null;
    name: string;
    description: string | null;
    hsnSacCode: string | null;
    quantity: number;
    unit: string | null;
    rate: number;
    discount: number;
    discountType: string;
    taxId: string | null;
  };
  const tpl = r.templateJson as
    | {
        paymentTermsId?: string | null;
        salespersonId?: string | null;
        currency?: string;
        discountValue?: number;
        discountType?: "percentage" | "amount";
        adjustmentValue?: number;
        adjustmentLabel?: string | null;
        customerNotes?: string | null;
        termsAndConditions?: string | null;
        lines?: TemplateLine[];
      }
    | null;

  const initial: Partial<RecurringInvoiceInput> = {
    profileName: r.profileName,
    contactId: r.contactId,
    frequency: r.frequency as RecurringInvoiceInput["frequency"],
    intervalN: r.intervalN,
    startDate: r.startDate,
    endDate: r.endDate,
    neverExpires: r.neverExpires,
    paymentTermsId: tpl?.paymentTermsId ?? null,
    salespersonId: tpl?.salespersonId ?? null,
    emailAutomatically: r.emailAutomatically,
    currency: tpl?.currency ?? organization.currency,
    documentDiscount: {
      value: Number(tpl?.discountValue ?? 0),
      type: (tpl?.discountType as "percentage" | "amount") ?? "percentage",
    },
    adjustmentValue: Number(tpl?.adjustmentValue ?? 0),
    adjustmentLabel: tpl?.adjustmentLabel ?? "Adjustment",
    customerNotes: tpl?.customerNotes ?? "",
    termsAndConditions: tpl?.termsAndConditions ?? "",
  };

  const initialLines = (tpl?.lines ?? []).map((l, i) => ({
    id: `tpl-${i}`,
    itemId: l.itemId ?? null,
    name: l.name,
    description: l.description ?? "",
    hsnSacCode: l.hsnSacCode ?? "",
    quantity: String(l.quantity ?? "1"),
    unit: l.unit ?? "",
    rate: String(l.rate ?? "0"),
    discount: String(l.discount ?? "0"),
    discountType: (l.discountType as "percentage" | "amount") ?? "percentage",
    taxId: l.taxId ?? null,
  }));

  async function submit(values: RecurringInvoiceInput) {
    "use server";
    await updateRecurringInvoiceAction(params.id, values);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href={`/sales/recurring-invoices/${r.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Edit Recurring Profile</h1>
      </div>
      <RecurringForm
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
        }))}
        taxOptions={taxes.map((t) => ({
          value: t.id,
          label: `${t.name} (${Number(t.rate)}%)`,
          rate: Number(t.rate),
        }))}
        paymentTermsOptions={paymentTerms.map((p) => ({ value: p.id, label: p.name }))}
        salespersonOptions={salespeople.map((s) => ({ value: s.id, label: s.name }))}
        onSubmitAction={submit}
        submitLabel="Update profile"
        cancelHref={`/sales/recurring-invoices/${r.id}`}
      />
    </div>
  );
}
