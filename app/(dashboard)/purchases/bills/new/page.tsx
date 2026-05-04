import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { BillForm, type BillFormValues } from "../bill-form";
import { createBillAction } from "../actions";

export const metadata = { title: "New Bill" };

export default async function NewBillPage() {
  const { organization } = await requireOrganization();
  const [vendors, items] = await Promise.all([
    db.contact.findMany({ where: { organizationId: organization.id, deletedAt: null, type: { in: ["VENDOR", "BOTH"] } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
    db.item.findMany({ where: { organizationId: organization.id, deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, costPrice: true, purchaseDescription: true } }),
  ]);
  async function submit(values: BillFormValues) {
    "use server";
    if (!values.contactId) throw new Error("Vendor required");
    await createBillAction({ contactId: values.contactId, status: values.status, issueDate: new Date(values.issueDate), dueDate: new Date(values.dueDate), notes: values.notes || null, lines: values.lines });
  }
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/purchases/bills"><ArrowLeft className="h-4 w-4" /></Link></Button>
      </div>
      <BillForm
        currency={organization.currency}
        vendorOptions={vendors.map((v) => ({ value: v.id, label: v.displayName }))}
        itemOptions={items.map((i) => ({ value: i.id, label: i.name, costPrice: i.costPrice ? Number(i.costPrice) : null, description: i.purchaseDescription ?? null }))}
        onSubmit={submit}
        submitLabel="Create bill"
      />
    </div>
  );
}
