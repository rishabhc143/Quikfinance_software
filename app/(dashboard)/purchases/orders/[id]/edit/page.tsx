import Link from "next/link";
import { DirtyFormProvider, DirtyLink } from "@/components/shared/dirty-form-nav";
import { notFound } from "next/navigation";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { PurchaseOrderForm } from "../../po-form";
import {
  updatePurchaseOrderAction,
  // (createPurchaseOrderAction lives next to this for the New page —
  // edit page binds id and uses updatePurchaseOrderAction.)
} from "../../actions";
import type { PurchaseOrderInput } from "@/lib/validations/purchase-order";
import type { LineItem } from "@/components/shared/transaction-line-items-table";

export const metadata = { title: "Edit Purchase Order" };

export default async function EditPurchaseOrderPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();

  const [po, vendors, customers, items, taxes, accounts, paymentTerms] =
    await Promise.all([
      db.purchaseOrder.findFirst({
        where: {
          id: params.id,
          organizationId: organization.id,
          deletedAt: null,
        },
        include: {
          lineItems: { orderBy: { position: "asc" } },
          attachments: true,
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

  if (!po) notFound();
  if (po.status === "CLOSED" || po.status === "CANCELLED") {
    // The action would also block this, but bail early so the form
    // never even mounts with stale data.
    notFound();
  }

  // Map DB row → form initial state.
  const initial: Partial<PurchaseOrderInput> = {
    contactId: po.contactId,
    referenceNumber: po.referenceNumber,
    orderDate: po.orderDate.toISOString().slice(0, 10) as unknown as Date,
    deliveryDate: po.deliveryDate
      ? (po.deliveryDate.toISOString().slice(0, 10) as unknown as Date)
      : null,
    paymentTermsId: po.paymentTermsId,
    shipmentPreferenceId: po.shipmentPreferenceId,
    deliveryAddressMode: (po.deliveryAddressMode as "ORGANIZATION" | "CUSTOMER") ?? "ORGANIZATION",
    deliveryToCustomerId: po.deliveryToCustomerId,
    deliveryAddressId: po.deliveryAddressId,
    placeOfSupply: po.placeOfSupply,
    status: po.status as PurchaseOrderInput["status"],
    currency: po.currency ?? organization.currency,
    documentDiscount: {
      value: Number(po.discountValue),
      type: po.discountType as "percentage" | "amount",
    },
    documentTax: po.taxId
      ? {
          taxId: po.taxId,
          type: (po.taxType as "TDS" | "TCS") ?? "TDS",
        }
      : null,
    adjustmentLabel: po.adjustmentLabel,
    adjustmentValue: Number(po.adjustmentValue),
    notes: po.notes,
    termsAndConditions: po.termsAndConditions,
    pdfTemplateId: po.pdfTemplateId,
    attachments: po.attachments.map((a) => ({
      fileName: a.fileName,
      fileUrl: a.fileUrl,
      fileSize: a.fileSize,
      mimeType: a.mimeType ?? "application/octet-stream",
    })),
  };

  const initialLines: LineItem[] = po.lineItems.map((l) => ({
    id: l.id,
    itemId: l.itemId,
    name: l.name,
    description: l.description ?? undefined,
    hsnSacCode: l.hsnSacCode ?? undefined,
    accountId: l.accountId,
    quantity: String(l.quantity),
    unit: l.unit ?? undefined,
    rate: String(l.rate),
    discount: String(l.discount),
    discountType: l.discountType as "percentage" | "amount",
    taxId: l.taxId,
  }));

  const action = updatePurchaseOrderAction.bind(null, po.id);

  return (
    <DirtyFormProvider>
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link href="/purchases/orders" className="hover:underline">
          Purchase orders
        </Link>
        <span className="mx-1">/</span>
        <span aria-current="page">{po.number}</span>
      </nav>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <DirtyLink href="/purchases/orders">
            <ArrowLeft className="h-4 w-4" />
          </DirtyLink>
        </Button>
        <ShoppingBag className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit purchase order
        </h1>
        <span className="text-xs text-muted-foreground font-mono ml-2">
          {po.number}
        </span>
      </div>
      <PurchaseOrderForm
        isCreate={false}
        nextNumber={po.number}
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
        defaultCurrency={po.currency ?? organization.currency}
        onSubmitAction={action}
        submitLabel="Update purchase order"
      />
    </div>
    </DirtyFormProvider>
  );
}
