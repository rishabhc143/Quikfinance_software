import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
    where: { organizationId: organization.id, deletedAt: null, type: { in: ["VENDOR", "BOTH"] } },
    orderBy: { displayName: "asc" }, select: { id: true, displayName: true },
  });
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/purchases/expenses"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">Record Expense</h1>
      </div>
      <ExpenseForm
        action={createExpenseAction}
        vendorOptions={vendors.map((v) => ({ value: v.id, label: v.displayName }))}
        currency={organization.currency}
        initial={{ date: format(new Date(), "yyyy-MM-dd") }}
        submitLabel="Record"
      />
    </div>
  );
}
