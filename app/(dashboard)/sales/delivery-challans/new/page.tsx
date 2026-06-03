import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { ChallanForm } from "../challan-form";
import { createDeliveryChallanAction } from "../actions";
import type { DeliveryChallanInput } from "@/lib/validations/delivery-challan";

export const metadata = { title: "New Delivery Challan" };

export default async function NewChallanPage() {
  const { organization } = await requireOrganization();
  const [contacts, items, taxes, pdfTemplates, customFieldDefs] = await Promise.all([
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
      select: {
        id: true,
        name: true,
        sellingPrice: true,
        salesDescription: true,
        unit: true,
        // PR #339 — plumb Item Sales Information fields through.
        salesTaxId: true,
        sellingPriceInclusiveOfTax: true,
        salesTax: { select: { rate: true } },
      },
    }),
    db.tax.findMany({
      where: { organizationId: organization.id, isActive: true },
      orderBy: { rate: "asc" },
    }),
    db.pdfTemplate.findMany({
      where: { organizationId: organization.id, documentType: "DELIVERY_CHALLAN" },
      orderBy: { name: "asc" },
    }),
    db.customFieldDefinition.findMany({
      where: {
        organizationId: organization.id,
        entityType: "DELIVERY_CHALLAN",
        deletedAt: null,
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  async function submit(values: DeliveryChallanInput) {
    "use server";
    await createDeliveryChallanAction(values);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/sales/delivery-challans">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">New Delivery Challan</h1>
      </div>
      <ChallanForm
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
          salesTaxId: i.salesTaxId,
          sellingPriceInclusiveOfTax: i.sellingPriceInclusiveOfTax,
          salesTaxRate: i.salesTax?.rate ? Number(i.salesTax.rate) : null,
        }))}
        taxOptions={taxes.map((t) => ({
          value: t.id,
          label: `${t.name} (${Number(t.rate)}%)`,
          rate: Number(t.rate),
        }))}
        pdfTemplateOptions={pdfTemplates.map((t) => ({ value: t.id, label: t.name }))}
        customFieldDefinitions={customFieldDefs.map((d) => ({
          id: d.id,
          fieldKey: d.fieldKey,
          label: d.label,
          dataType: d.dataType as
            | "text"
            | "number"
            | "date"
            | "dropdown"
            | "checkbox"
            | "email"
            | "url",
          options:
            (d.options as { label: string; value: string }[] | null) ?? null,
          isRequired: d.isRequired,
        }))}
        onSubmitAction={submit}
      />
    </div>
  );
}
