import { DirtyFormProvider, DirtyLink } from "@/components/shared/dirty-form-nav";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, AlertTriangle } from "lucide-react";
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
    <DirtyFormProvider>
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon"><DirtyLink href="/purchases/expenses"><ArrowLeft className="h-4 w-4" /></DirtyLink></Button>
          <h1 className="text-xl font-semibold">Edit Expense</h1>
        </div>
        <DeleteButton action={deleteExpenseAction.bind(null, e.id)} redirectTo="/purchases/expenses" />
      </div>
      {/* TODO: Expenses refinement patch — full UI per
          <expenses_spec_placeholder>. */}
      <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <strong>Expenses module is pending detailed spec.</strong>{" "}
          Mileage, Itemize, Receipt Upload, and Convert to Bill ship
          in a follow-up patch.
        </div>
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
    </DirtyFormProvider>
  );
}
