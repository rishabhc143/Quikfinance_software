import Link from "next/link";
import { ArrowLeft, Globe } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { CurrencyAdjustmentForm } from "./form";

export const metadata = { title: "New Currency Adjustment" };

/**
 * ACCT-C — Server wrapper for the New Currency Adjustment form.
 *
 * Loads the org's active CoA entries so the account picker has
 * something to populate. The two SYS-FX system accounts are
 * lazy-created at post time, not here.
 */
export default async function NewCurrencyAdjustmentPage() {
  const { organization } = await requireOrganization();

  const accounts = await db.chartOfAccount.findMany({
    where: { organizationId: organization.id, isActive: true },
    select: { id: true, name: true, code: true, type: true },
    orderBy: [{ type: "asc" }, { code: "asc" }, { name: "asc" }],
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/accountant/currency-adjustments">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Globe className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">New Currency Adjustment</h1>
      </div>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You need at least one Chart-of-Accounts entry first.{" "}
          <Link
            href="/accountant/chart-of-accounts/new"
            className="text-primary underline"
          >
            Create one
          </Link>
          .
        </p>
      ) : (
        <CurrencyAdjustmentForm
          accounts={accounts}
          currency={organization.currency}
          defaultDate={format(new Date(), "yyyy-MM-dd")}
        />
      )}
    </div>
  );
}
