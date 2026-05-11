import Link from "next/link";
import { ArrowLeft, FileMinus } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { peekNextDocumentNumber } from "@/lib/sales/numbering";
import { CreditForm } from "../credit-form";
import { createVendorCreditAction } from "../actions";

export const metadata = { title: "New Vendor Credit" };

export default async function NewVendorCreditPage() {
  const { organization } = await requireOrganization();
  const [nextNumber, vendors, items, taxes, accounts] = await Promise.all([
    peekNextDocumentNumber(organization.id, "VENDOR_CREDIT"),
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
  ]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/purchases/vendor-credits">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <FileMinus className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          New Vendor Credit
        </h1>
      </div>
      <CreditForm
        isCreate
        nextNumber={nextNumber}
        vendorOptions={vendors.map((v) => ({
          value: v.id,
          label: v.displayName,
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
        defaultCurrency={organization.currency}
        onSubmitAction={createVendorCreditAction}
        submitLabel="Save as Draft"
      />
    </div>
  );
}
