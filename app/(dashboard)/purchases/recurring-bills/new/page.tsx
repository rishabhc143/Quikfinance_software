import Link from "next/link";
import { ArrowLeft, Repeat } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { RecurringBillForm } from "../recurring-bill-form";
import { createRecurringBillAction } from "../actions";

export const metadata = { title: "New Recurring Bill" };

export default async function NewRecurringBillPage() {
  const { organization } = await requireOrganization();
  const [vendors, customers, items, taxes, accounts, paymentTerms] =
    await Promise.all([
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

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/purchases/recurring-bills">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Repeat className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          New Recurring Bill
        </h1>
      </div>
      <RecurringBillForm
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
  );
}
