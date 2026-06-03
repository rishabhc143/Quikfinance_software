import Link from "next/link";
import { DirtyFormProvider, DirtyLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft, X } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import {
  BUDGETABLE_ACCOUNT_TYPES,
  fiscalYearLabel,
} from "@/lib/accounting/budgets";
import { BudgetForm } from "./form";

export const metadata = { title: "New Budget" };

/**
 * ACCT-D.2 — Server wrapper for the New Budget form.
 *
 * Fetches all org accounts whose type is in the budget-able set,
 * then partitions them into the five buckets the form needs
 * (Income / Expense / Asset / Liability / Equity). Computes the
 * three Fiscal Year dropdown options (prev / current / next FY)
 * honoring the org's `fiscalYearStart`.
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

  const income = accounts.filter(
    (a) => a.type === "INCOME" || a.type === "OTHER_INCOME"
  );
  const expense = accounts.filter(
    (a) =>
      a.type === "EXPENSE" ||
      a.type === "OTHER_EXPENSE" ||
      a.type === "COST_OF_GOODS_SOLD"
  );
  const asset = accounts.filter((a) => a.type === "ASSET");
  const liability = accounts.filter((a) => a.type === "LIABILITY");
  const equity = accounts.filter((a) => a.type === "EQUITY");

  // Default fiscal year — today's year unless we're past the org's
  // fiscalYearStart month into the next FY.
  const now = new Date();
  const defaultFiscalYear =
    now.getUTCMonth() + 1 >= organization.fiscalYearStart
      ? now.getUTCFullYear()
      : now.getUTCFullYear() - 1;

  // Dropdown options: 1 previous FY + current + 4 future FYs.
  // Matches the reference screenshot — accountants budget forward more
  // than backward, so the range is asymmetric.
  const fiscalYearOptions = [-1, 0, 1, 2, 3, 4].map((delta) => {
    const value = defaultFiscalYear + delta;
    return {
      value,
      label: fiscalYearLabel(value, organization.fiscalYearStart),
    };
  });

  return (
    <DirtyFormProvider>
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <DirtyLink href="/accountant/budgets">
              <ArrowLeft className="h-4 w-4" />
            </DirtyLink>
          </Button>
          <h1 className="text-xl font-semibold">New Budget</h1>
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Close">
          <DirtyLink href="/accountant/budgets">
            <X className="h-4 w-4" />
          </DirtyLink>
        </Button>
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
          income={income}
          expense={expense}
          asset={asset}
          liability={liability}
          equity={equity}
          fiscalYearOptions={fiscalYearOptions}
          defaultFiscalYear={defaultFiscalYear}
        />
      )}
    </div>
    </DirtyFormProvider>
  );
}
