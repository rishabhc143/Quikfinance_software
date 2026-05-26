import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Receipt } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { BillForm } from "../../bill-form";
import {
  updateBillAction,
  checkBillNumberDuplicateAction,
} from "../../actions";
import type { BillInput } from "@/lib/validations/bill";
import type { LineItem } from "@/components/shared/transaction-line-items-table";

export const metadata = { title: "Edit Bill" };

export default async function EditBillPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();

  const [
    b,
    vendors,
    customers,
    items,
    taxes,
    accounts,
    paymentTerms,
    accountsPayable,
  ] = await Promise.all([
      db.bill.findFirst({
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
      db.chartOfAccount.findMany({
        where: {
          organizationId: organization.id,
          isActive: true,
          type: "LIABILITY",
        },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
    ]);

  if (!b) notFound();
  // PAID / WRITTEN_OFF can't be edited (action also blocks; bail early).
  if (b.status === "PAID" || b.status === "WRITTEN_OFF") notFound();

  const initial: Partial<BillInput> = {
    contactId: b.contactId,
    number: b.number,
    referenceNumber: b.referenceNumber,
    subject: b.subject,
    issueDate: b.issueDate.toISOString().slice(0, 10) as unknown as Date,
    dueDate: b.dueDate.toISOString().slice(0, 10) as unknown as Date,
    paymentTermsId: b.paymentTermsId,
    placeOfSupply: b.placeOfSupply,
    purchaseOrderId: b.purchaseOrderId,
    accountsPayableId: b.accountsPayableId,
    status: b.status as BillInput["status"],
    currency: b.currency ?? organization.currency,
    documentDiscount: {
      value: Number(b.discountValue),
      type: b.discountType as "percentage" | "amount",
    },
    documentTax: b.taxId
      ? { taxId: b.taxId, type: "TDS" as const }
      : null,
    adjustmentLabel: b.adjustmentLabel,
    adjustmentValue: Number(b.adjustmentValue),
    notes: b.notes,
    termsAndConditions: b.termsAndConditions,
    pdfTemplateId: b.pdfTemplateId,
    attachments: b.attachments.map((a) => ({
      fileName: a.fileName,
      fileUrl: a.fileUrl,
      fileSize: a.fileSize,
      mimeType: a.mimeType ?? "application/octet-stream",
    })),
  };

  const initialLines: LineItem[] = b.lineItems.map((l) => ({
    id: l.id,
    itemId: l.itemId,
    name: l.name || l.description || "",
    description: l.description ?? undefined,
    hsnSacCode: l.hsnSacCode ?? undefined,
    accountId: l.accountId,
    billableToCustomerId: l.billableToCustomerId,
    quantity: String(l.quantity),
    rate: String(l.rate),
    taxId: l.taxId,
  }));

  const action = updateBillAction.bind(null, b.id);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link href="/purchases/bills" className="hover:underline">
          Bills
        </Link>
        <span className="mx-1">/</span>
        <Link href={`/purchases/bills/${b.id}`} className="hover:underline">
          {b.number}
        </Link>
        <span className="mx-1">/</span>
        <span aria-current="page">Edit</span>
      </nav>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href={`/purchases/bills/${b.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Receipt className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Edit bill</h1>
        <span className="text-xs text-muted-foreground font-mono ml-2">
          {b.number}
        </span>
      </div>
      <BillForm
        isCreate={false}
        singleAction
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
        accountsPayableOptions={accountsPayable.map((a) => ({
          value: a.id,
          label: a.code ? `${a.code} — ${a.name}` : a.name,
        }))}
        defaultCurrency={b.currency ?? organization.currency}
        onSubmitAction={action}
        checkDuplicateAction={checkBillNumberDuplicateAction}
        excludeBillId={b.id}
        submitLabel="Update bill"
      />
    </div>
  );
}
