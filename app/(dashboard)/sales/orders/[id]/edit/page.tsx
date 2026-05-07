import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { SalesOrderForm } from "../../sales-order-form";
import { updateSalesOrderAction } from "../../actions";
import type { SalesOrderInput } from "@/lib/validations/sales-order";

export const metadata = { title: "Edit Sales Order" };

export default async function EditSalesOrderPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const so = await db.salesOrder.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: { lineItems: { orderBy: { position: "asc" } } },
  });
  if (!so) notFound();
  if (so.status === "CLOSED" || so.status === "VOID") notFound();

  const [contacts, items, taxes, salespeople, paymentTerms, deliveryMethods, pdfTemplates] = await Promise.all([
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
    db.pdfTemplate.findMany({
      where: { organizationId: organization.id, documentType: "SALES_ORDER" },
      orderBy: { name: "asc" },
    }),
  ]);

  const initial: Partial<SalesOrderInput> = {
    contactId: so.contactId,
    referenceNumber: so.referenceNumber ?? "",
    orderDate: so.orderDate,
    expectedShipmentDate: so.expectedShipmentDate,
    paymentTermsId: so.paymentTermsId,
    deliveryMethodId: so.deliveryMethodId,
    salespersonId: so.salespersonId,
    status: so.status,
    currency: so.currency,
    documentDiscount: {
      value: Number(so.discountValue),
      type: (so.discountType as "percentage" | "amount") ?? "percentage",
    },
    adjustmentLabel: so.adjustmentLabel ?? "Adjustment",
    adjustmentValue: Number(so.adjustmentValue),
    customerNotes: so.customerNotes ?? "",
    termsAndConditions: so.termsAndConditions ?? "",
  };

  const initialLines = so.lineItems.map((l) => ({
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

  async function submit(values: SalesOrderInput) {
    "use server";
    await updateSalesOrderAction(params.id, values);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href={`/sales/orders/${so.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Edit Sales Order {so.number}</h1>
      </div>
      <SalesOrderForm
        initial={initial}
        initialLines={initialLines}
        nextNumber={so.number}
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
        paymentTermsOptions={paymentTerms.map((p) => ({ value: p.id, label: p.name }))}
        deliveryMethodOptions={deliveryMethods.map((d) => ({ value: d.id, label: d.name }))}
        pdfTemplateOptions={pdfTemplates.map((t) => ({ value: t.id, label: t.name }))}
        onSubmitAction={submit}
        submitLabel="Update sales order"
        cancelHref={`/sales/orders/${so.id}`}
      />
    </div>
  );
}
