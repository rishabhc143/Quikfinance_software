import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { BillForm, type BillFormValues } from "../../bill-form";
import { updateBillAction } from "../../actions";

export default async function EditBillPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrganization();
  const b = await db.bill.findFirst({ where: { id: params.id, organizationId: organization.id, deletedAt: null }, include: { lineItems: true } });
  if (!b) notFound();
  const [vendors, items] = await Promise.all([
    db.contact.findMany({ where: { organizationId: organization.id, deletedAt: null, type: { in: ["VENDOR", "BOTH"] } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
    db.item.findMany({ where: { organizationId: organization.id, deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, costPrice: true, purchaseDescription: true } }),
  ]);
  // The new BillStatus enum adds WRITTEN_OFF; the stub form doesn't
  // yet handle it. Coerce to a known value for now — the full
  // Purchases UI rebuild swaps this form out per the master prompt.
  const knownStatus = b.status === "WRITTEN_OFF" ? "VOID" : b.status;
  const initial: Partial<BillFormValues> = {
    contactId: b.contactId,
    status: knownStatus as BillFormValues["status"],
    issueDate: format(b.issueDate, "yyyy-MM-dd"), dueDate: format(b.dueDate, "yyyy-MM-dd"),
    notes: b.notes ?? "",
    lines: b.lineItems.map((l) => ({ itemId: l.itemId, description: l.description, quantity: Number(l.quantity), rate: Number(l.rate) })),
  };
  async function submit(values: BillFormValues) {
    "use server";
    if (!values.contactId) throw new Error("Vendor required");
    await updateBillAction(params.id, { contactId: values.contactId, status: values.status, issueDate: new Date(values.issueDate), dueDate: new Date(values.dueDate), notes: values.notes || null, lines: values.lines });
  }
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href={`/purchases/bills/${b.id}`}><ArrowLeft className="h-4 w-4" /></Link></Button>
      </div>
      <BillForm
        title={`Edit ${b.number}`}
        initial={initial}
        currency={organization.currency}
        vendorOptions={vendors.map((v) => ({ value: v.id, label: v.displayName }))}
        itemOptions={items.map((i) => ({ value: i.id, label: i.name, costPrice: i.costPrice ? Number(i.costPrice) : null, description: i.purchaseDescription ?? null }))}
        onSubmit={submit}
        submitLabel="Update bill"
      />
    </div>
  );
}
