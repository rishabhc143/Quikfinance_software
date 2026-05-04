import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { SimpleDocForm, type SimpleDocValues } from "@/components/shared/simple-doc-form";
import { createVendorCreditAction } from "../actions";

export const metadata = { title: "New Vendor Credit" };

export default async function NewVendorCreditPage() {
  const { organization } = await requireOrganization();
  const vendors = await db.contact.findMany({
    where: { organizationId: organization.id, deletedAt: null, type: { in: ["VENDOR", "BOTH"] } },
    select: { id: true, displayName: true }, orderBy: { displayName: "asc" },
  });
  async function submit(values: SimpleDocValues) {
    "use server";
    if (!values.contactId) throw new Error("Vendor required");
    await createVendorCreditAction({ contactId: values.contactId, date: new Date(values.date), total: values.total });
  }
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/purchases/vendor-credits"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Vendor Credit</h1>
      </div>
      <SimpleDocForm
        contactLabel="Vendor"
        statusOptions={["open"]}
        contactOptions={vendors.map((v) => ({ value: v.id, label: v.displayName }))}
        currency={organization.currency}
        defaultDate={format(new Date(), "yyyy-MM-dd")}
        onSubmitAction={submit}
        cancelHref="/purchases/vendor-credits"
        submitLabel="Create credit"
      />
    </div>
  );
}
