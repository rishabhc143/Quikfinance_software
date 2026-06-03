import Link from "next/link";
import { DirtyFormProvider, DirtyLink } from "@/components/shared/dirty-form-nav";
import { notFound } from "next/navigation";
import { ArrowLeft, Repeat } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { RecurringExpenseForm } from "../../recurring-expense-form";
import { updateRecurringExpenseAction } from "../../actions";
import type { RecurringExpenseInput } from "@/lib/validations/recurring-expense";

export const metadata = { title: "Edit Recurring Expense" };

export default async function EditRecurringExpensePage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const [profile, vendors, customers, expenseAccounts, paidThroughAccounts] =
    await Promise.all([
      db.recurringExpense.findFirst({
        where: {
          id: params.id,
          organizationId: organization.id,
          deletedAt: null,
        },
      }),
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

  if (!profile) notFound();
  if (profile.status === "STOPPED" || profile.status === "EXPIRED") notFound();

  const initial: Partial<RecurringExpenseInput> = {
    profileName: profile.profileName,
    category: profile.category,
    contactId: profile.contactId,
    customerId: profile.customerId,
    isBillable: profile.isBillable,
    expenseAccountId: profile.expenseAccountId ?? "",
    paidThroughAccountId: profile.paidThroughAccountId ?? "",
    frequency: profile.frequency as RecurringExpenseInput["frequency"],
    intervalN: profile.intervalN,
    startDate: (profile.startDate ?? profile.nextRunAt)
      .toISOString()
      .slice(0, 10) as unknown as Date,
    endDate: profile.endDate
      ? (profile.endDate.toISOString().slice(0, 10) as unknown as Date)
      : null,
    neverExpires: profile.neverExpires,
    amount: Number(profile.amount),
    notes: profile.notes,
    status: profile.status as RecurringExpenseInput["status"],
  };

  const action = updateRecurringExpenseAction.bind(null, profile.id);

  return (
    <DirtyFormProvider>
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link
          href="/purchases/recurring-expenses"
          className="hover:underline"
        >
          Recurring expenses
        </Link>
        <span className="mx-1">/</span>
        <Link
          href={`/purchases/recurring-expenses/${profile.id}`}
          className="hover:underline"
        >
          {profile.profileName}
        </Link>
        <span className="mx-1">/</span>
        <span aria-current="page">Edit</span>
      </nav>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <DirtyLink href={`/purchases/recurring-expenses/${profile.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </DirtyLink>
        </Button>
        <Repeat className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit recurring expense
        </h1>
      </div>
      <RecurringExpenseForm
        initial={initial}
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
        onSubmitAction={action}
        submitLabel="Update profile"
      />
    </div>
    </DirtyFormProvider>
  );
}
