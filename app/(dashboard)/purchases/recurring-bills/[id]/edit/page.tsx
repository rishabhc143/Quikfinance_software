import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Repeat } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { RecurringBillForm } from "../../recurring-bill-form";
import { updateRecurringBillAction } from "../../actions";
import type { RecurringBillInput } from "@/lib/validations/recurring-bill";
import type { LineItem } from "@/components/shared/transaction-line-items-table";

export const metadata = { title: "Edit Recurring Bill" };

type TemplateLine = {
  itemId?: string | null;
  position?: number;
  name: string;
  description?: string | null;
  hsnSacCode?: string | null;
  accountId?: string | null;
  billableToCustomerId?: string | null;
  quantity: number;
  rate: number;
  taxId?: string | null;
  amount: number;
};

type Template = {
  referenceNumber?: string | null;
  paymentTermsId?: string | null;
  placeOfSupply?: string | null;
  currency?: string;
  discountValue?: number;
  discountType?: string;
  taxId?: string | null;
  adjustmentLabel?: string | null;
  adjustmentValue?: number;
  termsAndConditions?: string | null;
  lines?: TemplateLine[];
};

export default async function EditRecurringBillPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const [profile, vendors, customers, items, taxes, accounts, paymentTerms] =
    await Promise.all([
      db.recurringBill.findFirst({
        where: {
          id: params.id,
          organizationId: organization.id,
          deletedAt: null,
        },
      }),
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
    ]);

  if (!profile) notFound();
  if (profile.status === "STOPPED" || profile.status === "EXPIRED") notFound();

  const tmpl = (profile.templateJson ?? {}) as Template;

  const initial: Partial<RecurringBillInput> = {
    profileName: profile.profileName,
    contactId: profile.contactId ?? "",
    referenceNumber: tmpl.referenceNumber ?? null,
    frequency: profile.frequency as RecurringBillInput["frequency"],
    intervalN: profile.intervalN,
    startDate: (profile.startDate ?? profile.nextRunAt)
      .toISOString()
      .slice(0, 10) as unknown as Date,
    endDate: profile.endDate
      ? (profile.endDate.toISOString().slice(0, 10) as unknown as Date)
      : null,
    neverExpires: profile.neverExpires,
    paymentTermsId: tmpl.paymentTermsId ?? null,
    placeOfSupply: tmpl.placeOfSupply ?? null,
    currency: tmpl.currency ?? organization.currency,
    documentDiscount: {
      value: Number(tmpl.discountValue ?? 0),
      type: (tmpl.discountType as "percentage" | "amount") ?? "percentage",
    },
    documentTax: tmpl.taxId
      ? { taxId: tmpl.taxId, type: "TDS" as const }
      : null,
    adjustmentLabel: tmpl.adjustmentLabel ?? "Adjustment",
    adjustmentValue: Number(tmpl.adjustmentValue ?? 0),
    termsAndConditions: tmpl.termsAndConditions ?? null,
    status: profile.status as RecurringBillInput["status"],
  };

  const initialLines: LineItem[] = (tmpl.lines ?? []).map(
    (l: TemplateLine, i) => ({
      id: `line-${i}`,
      itemId: l.itemId ?? null,
      name: l.name,
      description: l.description ?? undefined,
      hsnSacCode: l.hsnSacCode ?? undefined,
      accountId: l.accountId ?? null,
      billableToCustomerId: l.billableToCustomerId ?? null,
      quantity: String(l.quantity),
      rate: String(l.rate),
      taxId: l.taxId ?? null,
    })
  );

  const action = updateRecurringBillAction.bind(null, profile.id);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link href="/purchases/recurring-bills" className="hover:underline">
          Recurring bills
        </Link>
        <span className="mx-1">/</span>
        <Link
          href={`/purchases/recurring-bills/${profile.id}`}
          className="hover:underline"
        >
          {profile.profileName}
        </Link>
        <span className="mx-1">/</span>
        <span aria-current="page">Edit</span>
      </nav>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href={`/purchases/recurring-bills/${profile.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Repeat className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit recurring bill
        </h1>
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
        defaultCurrency={tmpl.currency ?? organization.currency}
        onSubmitAction={action}
        submitLabel="Update profile"
      />
    </div>
  );
}
