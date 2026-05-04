import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { SimpleDocForm, type SimpleDocValues } from "@/components/shared/simple-doc-form";
import { createPurchaseOrderAction } from "../actions";

export const metadata = { title: "New Purchase Order" };

export default async function NewPurchaseOrderPage() {
  const { organization } = await requireOrganization();
  const vendors = await db.contact.findMany({
    where: { organizationId: organization.id, deletedAt: null, type: { in: ["VENDOR", "BOTH"] } },
    select: { id: true, displayName: true }, orderBy: { displayName: "asc" },
  });
  async function submit(values: SimpleDocValues) {
    "use server";
    if (!values.contactId) throw new Error("Vendor required");
    await createPurchaseOrderAction({ contactId: values.contactId, date: new Date(values.date), total: values.total, status: values.status });
  }
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/purchases/orders"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Purchase Order</h1>
      </div>
      <SimpleDocForm
        contactLabel="Vendor"
        statusOptions={["draft", "sent", "received", "cancelled"]}
        contactOptions={vendors.map((v) => ({ value: v.id, label: v.displayName }))}
        currency={organization.currency}
        defaultDate={format(new Date(), "yyyy-MM-dd")}
        onSubmitAction={submit}
        cancelHref="/purchases/orders"
        submitLabel="Create PO"
      />
    </div>
  );
}
