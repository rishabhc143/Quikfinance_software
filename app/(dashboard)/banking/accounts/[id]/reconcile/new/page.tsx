import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { InitiateForm } from "./initiate-form";

export const metadata = { title: "Reconcile Account" };

/**
 * BNK-F — Initiate-reconciliation page. Computes the suggested opening
 * balance (last FINALISED reconciliation's closing → falls back to
 * BankAccount.openingBalance) and renders the form.
 */
export default async function NewReconciliationPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();

  const account = await db.bankAccount.findFirst({
    where: { id: params.id, organizationId: organization.id },
    select: {
      id: true,
      name: true,
      currency: true,
      openingBalance: true,
    },
  });
  if (!account) notFound();

  const lastFinalised = await db.reconciliation.findFirst({
    where: {
      bankAccountId: account.id,
      organizationId: organization.id,
      status: "FINALISED",
    },
    orderBy: { endDate: "desc" },
    select: { closingBalance: true, endDate: true },
  });

  const suggestedOpeningBalance = lastFinalised
    ? Number(lastFinalised.closingBalance)
    : Number(account.openingBalance);
  const suggestedOpeningSource = lastFinalised
    ? `Closing balance of the last reconciliation (${format(
        lastFinalised.endDate,
        "dd MMM yyyy"
      )})`
    : "Account opening balance";

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href={`/banking/accounts/${account.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Reconcile {account.name}
        </h1>
      </div>
      <InitiateForm
        bankAccountId={account.id}
        currency={account.currency}
        suggestedOpeningBalance={suggestedOpeningBalance}
        suggestedOpeningSource={suggestedOpeningSource}
      />
    </div>
  );
}
