import { DirtyFormProvider, DirtyLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft, Repeat } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { RecurringExpenseForm } from "../recurring-expense-form";
import { createRecurringExpenseAction } from "../actions";

export const metadata = { title: "New Recurring Expense" };

export default async function NewRecurringExpensePage() {
  const { organization } = await requireOrganization();
  const [vendors, customers, expenseAccounts, paidThroughAccounts] =
    await Promise.all([
      db.contact.findMany({
        where: {
          organizationId: organization.id,
          type: { in: ["VENDOR", "BOTH"] },
          deletedAt: null,
          isInactive: false,
        },
        select: { id: true, displayName: true },
        orderBy: { displayName: "asc" },
      }),
      db.contact.findMany({
        where: {
          organizationId: organization.id,
          type: { in: ["CUSTOMER", "BOTH"] },
          deletedAt: null,
          isInactive: false,
        },
        select: { id: true, displayName: true },
        orderBy: { displayName: "asc" },
      }),
      db.chartOfAccount.findMany({
        where: {
          organizationId: organization.id,
          isActive: true,
          type: { in: ["EXPENSE", "COST_OF_GOODS_SOLD"] },
        },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
      db.chartOfAccount.findMany({
        where: {
          organizationId: organization.id,
          isActive: true,
          type: { in: ["ASSET", "LIABILITY"] },
        },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
    ]);

  return (
    <DirtyFormProvider>
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <DirtyLink href="/purchases/recurring-expenses">
            <ArrowLeft className="h-4 w-4" />
          </DirtyLink>
        </Button>
        <Repeat className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          New Recurring Expense
        </h1>
      </div>
      <RecurringExpenseForm
        vendorOptions={vendors.map((v) => ({
          value: v.id,
          label: v.displayName,
        }))}
        customerOptions={customers.map((c) => ({
          value: c.id,
          label: c.displayName,
        }))}
        expenseAccountOptions={expenseAccounts.map((a) => ({
          value: a.id,
          label: a.code ? `${a.code} — ${a.name}` : a.name,
        }))}
        paidThroughAccountOptions={paidThroughAccounts.map((a) => ({
          value: a.id,
          label: a.code ? `${a.code} — ${a.name}` : a.name,
        }))}
        defaultCurrency={organization.currency}
        onSubmitAction={createRecurringExpenseAction}
        submitLabel="Save"
      />
    </div>
    </DirtyFormProvider>
  );
}
