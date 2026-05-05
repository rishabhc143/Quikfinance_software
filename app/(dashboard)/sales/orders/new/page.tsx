import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { SalesOrderForm } from "../sales-order-form";
import { createSalesOrderAction } from "../actions";
import { peekNextDocumentNumber } from "@/lib/sales/numbering";
import type { SalesOrderInput } from "@/lib/validations/sales-order";

export const metadata = { title: "New Sales Order" };

export default async function NewSalesOrderPage() {
  const { organization } = await requireOrganization();
  const [contacts, items, taxes, salespeople, paymentTerms, deliveryMethods, nextNumber] = await Promise.all([
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
    db.paymentTerms.findMany({
      where: { organizationId: organization.id },
      orderBy: { numberOfDays: "asc" },
    }),
    db.deliveryMethod.findMany({
      where: { organizationId: organization.id, isInactive: false },
      orderBy: { name: "asc" },
    }),
    peekNextDocumentNumber(organization.id, "SALES_ORDER"),
  ]);

  async function submit(values: SalesOrderInput, opts?: { send?: boolean }) {
    "use server";
    await createSalesOrderAction(values, opts);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link href="/sales/orders">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">New Sales Order</h1>
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Close">
          <Link href="/sales/orders">
            <X className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      <SalesOrderForm
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
        paymentTermsOptions={paymentTerms.map((p) => ({
          value: p.id,
          label: p.name,
          hint: p.numberOfDays === 0 ? "Due on receipt" : `${p.numberOfDays} days`,
        }))}
        deliveryMethodOptions={deliveryMethods.map((d) => ({ value: d.id, label: d.name }))}
        onSubmitAction={submit}
        submitLabel="Save as Draft"
      />
    </div>
  );
}
