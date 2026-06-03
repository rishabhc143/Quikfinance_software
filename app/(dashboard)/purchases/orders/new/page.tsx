import { DirtyFormProvider, DirtyLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { peekNextDocumentNumber } from "@/lib/sales/numbering";
import { PurchaseOrderForm } from "../po-form";
import { createPurchaseOrderAction } from "../actions";

export const metadata = { title: "New Purchase Order" };

export default async function NewPurchaseOrderPage() {
  const { organization } = await requireOrganization();

  const [
    nextNumber,
    vendors,
    customers,
    items,
    taxes,
    accounts,
    paymentTerms,
  ] = await Promise.all([
    peekNextDocumentNumber(organization.id, "PURCHASE_ORDER"),
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
        costPrice: true, // PO rates default to the vendor cost, not sellingPrice
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
        // POs typically book to EXPENSE or COGS accounts (the inline
        // ACCOUNT column on each line). Filter to those two types so
        // the dropdown isn't overwhelming.
        type: { in: ["EXPENSE", "COST_OF_GOODS_SOLD"] },
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
    <DirtyFormProvider>
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <DirtyLink href="/purchases/orders">
            <ArrowLeft className="h-4 w-4" />
          </DirtyLink>
        </Button>
        <ShoppingBag className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          New Purchase Order
        </h1>
      </div>
      <PurchaseOrderForm
        isCreate
        nextNumber={nextNumber}
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
        onSubmitAction={createPurchaseOrderAction}
        submitLabel="Save as Draft"
      />
    </div>
    </DirtyFormProvider>
  );
}
