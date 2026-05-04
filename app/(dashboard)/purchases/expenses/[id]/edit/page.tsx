import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { ExpenseForm } from "../../form";
import { updateExpenseAction, deleteExpenseAction } from "../../actions";
import { DeleteButton } from "@/components/shared/delete-button";

export default async function EditExpensePage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrganization();
  const e = await db.expense.findFirst({ where: { id: params.id, organizationId: organization.id } });
  if (!e) notFound();
  const vendors = await db.contact.findMany({ where: { organizationId: organization.id, deletedAt: null, type: { in: ["VENDOR", "BOTH"] } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } });
  async function update(formData: FormData) { "use server"; await updateExpenseAction(params.id, formData); }
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon"><Link href="/purchases/expenses"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <h1 className="text-xl font-semibold">Edit Expense</h1>
        </div>
        <DeleteButton action={deleteExpenseAction.bind(null, e.id)} redirectTo="/purchases/expenses" />
      </div>
      <ExpenseForm
        action={update}
        vendorOptions={vendors.map((v) => ({ value: v.id, label: v.displayName }))}
        currency={organization.currency}
        initial={{
          date: format(e.date, "yyyy-MM-dd"),
          category: e.category,
          amount: e.amount.toString(),
          contactId: e.contactId,
          reference: e.reference ?? "",
          notes: e.notes ?? "",
        }}
        submitLabel="Update"
      />
    </div>
  );
}
