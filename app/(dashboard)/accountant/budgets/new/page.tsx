import Link from "next/link";
import { ArrowLeft, Target } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { BUDGETABLE_ACCOUNT_TYPES } from "@/lib/accounting/budgets";
import { BudgetForm } from "./form";

export const metadata = { title: "New Budget" };

/**
 * ACCT-D — Server wrapper for the New Budget form. Loads the org's
 * active P&L accounts (the only ones a budget can target in v1) +
 * computes the default fiscal year off the org's fiscalYearStart.
 */
export default async function NewBudgetPage() {
  const { organization } = await requireOrganization();

  const accounts = await db.chartOfAccount.findMany({
    where: {
      organizationId: organization.id,
      isActive: true,
      type: { in: [...BUDGETABLE_ACCOUNT_TYPES] },
    },
    select: { id: true, name: true, code: true, type: true },
    orderBy: [{ type: "asc" }, { code: "asc" }, { name: "asc" }],
  });

  // Default fiscal year = today's year, rolling over if we're past
  // the org's fiscalYearStart month into the next FY.
  const now = new Date();
  const defaultFiscalYear =
    now.getUTCMonth() + 1 >= organization.fiscalYearStart
      ? now.getUTCFullYear()
      : now.getUTCFullYear() - 1;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/accountant/budgets">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Target className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">New Budget</h1>
      </div>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You need at least one Income or Expense account first.{" "}
          <Link
            href="/accountant/chart-of-accounts/new"
            className="text-primary underline"
          >
            Create one
          </Link>
          .
        </p>
      ) : (
        <BudgetForm
          accounts={accounts}
          currency={organization.currency}
          defaultFiscalYear={defaultFiscalYear}
        />
      )}
    </div>
  );
}
