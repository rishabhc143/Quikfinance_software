import { DirtyFormProvider, DirtyLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft, Repeat } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { RecurringBillForm } from "../recurring-bill-form";
import { createRecurringBillAction } from "../actions";
import type { RecurringBillInput } from "@/lib/validations/recurring-bill";
import type { LineItem } from "@/components/shared/transaction-line-items-table";

export const metadata = { title: "New Recurring Bill" };

export default async function NewRecurringBillPage({
  searchParams,
}: {
  searchParams?: { fromBillId?: string };
}) {
  const { organization } = await requireOrganization();
  const fromBillId = searchParams?.fromBillId;

  // When the user clicked "Convert to Recurring" on a Bill detail
  // page, ?fromBillId=<id> pre-seeds the form with that Bill's
  // vendor + line items + reference number. The user picks
  // frequency + start date on top.
  const [
    vendors,
    customers,
    items,
    taxes,
    accounts,
    paymentTerms,
    sourceBill,
  ] = await Promise.all([
    db.contact.findMany({
      where: {
        organizationId: organization.id,
        type: { in: ["VENDOR", "BOTH"] },
        deletedAt: null,
        isInactive: false,
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    db.contact.findMany({
      where: {
        organizationId: organization.id,
        type: { in: ["CUSTOMER", "BOTH"] },
        deletedAt: null,
        isInactive: false,
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    db.item.findMany({
      where: { organizationId: organization.id, deletedAt: null },
      select: {
        id: true,
        name: true,
        sku: true,
        costPrice: true,
        purchaseDescription: true,
        unit: true,
      },
      orderBy: { name: "asc" },
    }),
    db.tax.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true, name: true, rate: true },
      orderBy: { name: "asc" },
    }),
    db.chartOfAccount.findMany({
      where: {
        organizationId: organization.id,
        isActive: true,
        type: { in: ["EXPENSE", "COST_OF_GOODS_SOLD", "LIABILITY"] },
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    db.paymentTerms.findMany({
      where: { organizationId: organization.id },
      orderBy: { numberOfDays: "asc" },
      select: { id: true, name: true },
    }),
    fromBillId
      ? db.bill.findFirst({
          where: {
            id: fromBillId,
            organizationId: organization.id,
            deletedAt: null,
          },
          include: { lineItems: { orderBy: { position: "asc" } } },
        })
      : Promise.resolve(null),
  ]);

  // Seed initial form values from the source Bill, if present.
  const initial: Partial<RecurringBillInput> | undefined = sourceBill
    ? {
        profileName: `Recurring — ${sourceBill.number}`,
        contactId: sourceBill.contactId,
        referenceNumber: sourceBill.referenceNumber,
        frequency: "monthly" as const,
        intervalN: 1,
        // Start the cycle one period after the source bill's issue
        // date so the first generated row doesn't collide.
        startDate: new Date(
          sourceBill.issueDate.getTime() + 30 * 24 * 60 * 60 * 1000
        )
          .toISOString()
          .slice(0, 10) as unknown as Date,
        neverExpires: true,
        paymentTermsId: sourceBill.paymentTermsId,
        placeOfSupply: sourceBill.placeOfSupply,
        currency: sourceBill.currency ?? organization.currency,
        termsAndConditions: sourceBill.termsAndConditions,
      }
    : undefined;

  const initialLines: LineItem[] | undefined = sourceBill
    ? sourceBill.lineItems.map((l, i) => ({
        id: `seed-${i}`,
        itemId: l.itemId ?? null,
        name: l.name || l.description || "",
        description: l.description ?? undefined,
        hsnSacCode: l.hsnSacCode ?? undefined,
        accountId: l.accountId ?? null,
        billableToCustomerId: l.billableToCustomerId ?? null,
        quantity: String(l.quantity),
        rate: String(l.rate),
        taxId: l.taxId ?? null,
      }))
    : undefined;

  return (
    <DirtyFormProvider>
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <DirtyLink href="/purchases/recurring-bills">
            <ArrowLeft className="h-4 w-4" />
          </DirtyLink>
        </Button>
        <Repeat className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          New Recurring Bill
        </h1>
        {sourceBill ? (
          <span className="text-xs text-muted-foreground ml-2">
            from Bill <span className="font-mono">{sourceBill.number}</span>
          </span>
        ) : null}
      </div>
      <RecurringBillForm
        initial={initial}
        initialLines={initialLines}
        vendorOptions={vendors.map((v) => ({
          value: v.id,
          label: v.displayName,
        }))}
        customerOptions={customers.map((c) => ({
          value: c.id,
          label: c.displayName,
        }))}
        itemOptions={items.map((i) => ({
          value: i.id,
          label: i.name,
          sku: i.sku ?? undefined,
          rate: i.costPrice ? String(i.costPrice) : undefined,
          description: i.purchaseDescription ?? undefined,
          unit: i.unit ?? undefined,
        }))}
        taxOptions={taxes.map((t) => ({
          value: t.id,
          label: `${t.name} (${Number(t.rate)}%)`,
          rate: Number(t.rate),
        }))}
        accountOptions={accounts.map((a) => ({
          value: a.id,
          label: a.code ? `${a.code} — ${a.name}` : a.name,
        }))}
        paymentTermsOptions={paymentTerms.map((p) => ({
          value: p.id,
          label: p.name,
        }))}
        defaultCurrency={organization.currency}
        onSubmitAction={createRecurringBillAction}
        submitLabel="Save"
      />
    </div>
    </DirtyFormProvider>
  );
}
