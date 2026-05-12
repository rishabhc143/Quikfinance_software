import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { ExpenseForm } from "../form";
import { createExpenseAction } from "../actions";

export const metadata = { title: "Record Expense" };

export default async function NewExpensePage() {
  const { organization } = await requireOrganization();
  const vendors = await db.contact.findMany({
    where: {
      organizationId: organization.id,
      deletedAt: null,
      type: { in: ["VENDOR", "BOTH"] },
    },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true },
  });
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/purchases/expenses">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Record Expense</h1>
      </div>

      {/* TODO: Expenses refinement patch — full UI per
          <expenses_spec_placeholder>: Mileage type, Itemize,
          Mark-as-Billable workflow, Receipt OCR, Convert-to-Bill,
          Reimburse-Employee, Expense Reports. */}
      <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <strong>Expenses module is pending detailed spec.</strong> This
          form supports basic CRUD only. Mileage, Itemize, Receipt
          Upload, Convert to Bill, and Expense Reports ship in a
          follow-up patch once screenshots are available. Mark-as-Billable
          is already supported — billable expenses surface on the
          customer&apos;s next Invoice via the Billable Expenses banner.
        </div>
      </div>

      <ExpenseForm
        action={createExpenseAction}
        vendorOptions={vendors.map((v) => ({
          value: v.id,
          label: v.displayName,
        }))}
        currency={organization.currency}
        initial={{ date: format(new Date(), "yyyy-MM-dd") }}
        submitLabel="Record"
      />
    </div>
  );
}
