import { BackLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrganization } from "@/lib/auth-helpers";
import { ImportRecurringExpensesWizard } from "./wizard";

export const metadata = { title: "Import Recurring Expenses" };

/**
 * Server wrapper for the Recurring Expenses CSV import wizard.
 *
 * Simplest of the four import wizards because Recurring Expenses
 * have no line items per spec — just expense_account + amount +
 * paid_through + cadence. When `customer_name` resolves, the
 * profile auto-flips `isBillable=true` (mirrors the form's
 * cross-field rule).
 */
export default async function ImportRecurringExpensesPage() {
  await requireOrganization();
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <BackLink href="/purchases/recurring-expenses"><ArrowLeft className="h-4 w-4" /></BackLink>
        </Button>
        <h1 className="text-xl font-semibold">Import recurring expenses</h1>
      </div>
      <ImportRecurringExpensesWizard />
    </div>
  );
}
