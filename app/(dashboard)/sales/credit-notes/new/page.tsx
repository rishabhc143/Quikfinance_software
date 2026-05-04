import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { SimpleDocForm, type SimpleDocValues } from "@/components/shared/simple-doc-form";
import { createCreditNoteAction } from "../actions";

export const metadata = { title: "New Credit Note" };

export default async function NewCreditNotePage() {
  const { organization } = await requireOrganization();
  const customers = await db.contact.findMany({
    where: { organizationId: organization.id, deletedAt: null, type: { in: ["CUSTOMER", "BOTH"] } },
    select: { id: true, displayName: true }, orderBy: { displayName: "asc" },
  });
  async function submit(values: SimpleDocValues) {
    "use server";
    if (!values.contactId) throw new Error("Customer required");
    await createCreditNoteAction({ contactId: values.contactId, date: new Date(values.date), total: values.total });
  }
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/sales/credit-notes"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Credit Note</h1>
      </div>
      <SimpleDocForm
        contactLabel="Customer"
        statusOptions={["open"]}
        contactOptions={customers.map((c) => ({ value: c.id, label: c.displayName }))}
        currency={organization.currency}
        defaultDate={format(new Date(), "yyyy-MM-dd")}
        onSubmitAction={submit}
        cancelHref="/sales/credit-notes"
        submitLabel="Create credit note"
      />
    </div>
  );
}
