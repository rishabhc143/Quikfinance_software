import Link from "next/link";
import { ArrowLeft, Receipt } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { BillForm } from "../bill-form";
import {
  createBillAction,
  checkBillNumberDuplicateAction,
} from "../actions";

export const metadata = { title: "New Bill" };

export default async function NewBillPage({
  searchParams,
}: {
  searchParams?: { fromPO?: string };
}) {
  const { organization } = await requireOrganization();

  // Pre-fetch dropdown options. When `?fromPO=<id>` is supplied, also
  // load the source PO so we can seed the vendor + line items in
  // P4-D. For P4-B this query is harmless if the param is absent.
  const fromPoId = searchParams?.fromPO;
  const [vendors, customers, items, taxes, accounts, paymentTerms, sourcePO] =
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
      fromPoId
        ? db.purchaseOrder.findFirst({
            where: {
              id: fromPoId,
              organizationId: organization.id,
              deletedAt: null,
            },
            include: { lineItems: { orderBy: { position: "asc" } } },
          })
        : Promise.resolve(null),
    ]);

  // Seed initial values from the source PO when present.
  const initial = sourcePO
    ? {
        contactId: sourcePO.contactId,
        referenceNumber: sourcePO.number,
        purchaseOrderId: sourcePO.id,
        placeOfSupply: sourcePO.placeOfSupply,
        currency: sourcePO.currency ?? organization.currency,
        termsAndConditions: sourcePO.termsAndConditions,
      }
    : undefined;
  const initialLines = sourcePO
    ? sourcePO.lineItems.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        name: l.name,
        description: l.description ?? undefined,
        hsnSacCode: l.hsnSacCode ?? undefined,
        accountId: l.accountId,
        quantity: String(l.quantity),
        unit: l.unit ?? undefined,
        rate: String(l.rate),
        taxId: l.taxId,
      }))
    : undefined;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/purchases/bills">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Receipt className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">New Bill</h1>
        {sourcePO ? (
          <span className="text-xs text-muted-foreground ml-2">
            from PO{" "}
            <span className="font-mono">{sourcePO.number}</span>
          </span>
        ) : null}
      </div>
      <BillForm
        isCreate
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
        onSubmitAction={createBillAction}
        checkDuplicateAction={checkBillNumberDuplicateAction}
        submitLabel="Save as Draft"
      />
    </div>
  );
}
