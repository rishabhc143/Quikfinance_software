import { notFound } from "next/navigation";
import { BackLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReconcilePane, type ReconcileTxn } from "./reconcile-pane";

export const metadata = { title: "Reconcile" };

/**
 * BNK-F — Two-pane working screen for a reconciliation. Loads the
 * reconciliation row + every eligible BankTransaction in the period
 * (matched OR categorised OR unmatched, not excluded — the client
 * filters unmatched by default).
 */
export default async function ReconciliationDetailPage({
  params,
}: {
  params: { id: string; recId: string };
}) {
  const { organization } = await requireOrganization();

  const account = await db.bankAccount.findFirst({
    where: { id: params.id, organizationId: organization.id },
    select: { id: true, name: true, currency: true },
  });
  if (!account) notFound();

  const rec = await db.reconciliation.findFirst({
    where: {
      id: params.recId,
      organizationId: organization.id,
      bankAccountId: account.id,
    },
  });
  if (!rec) notFound();

  // Inclusive-end semantics: turn the date into the start of the next
  // day for the < query.
  const endExclusive = new Date(rec.endDate);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const txns = await db.bankTransaction.findMany({
    where: {
      bankAccountId: account.id,
      organizationId: organization.id,
      date: { gte: rec.startDate, lt: endExclusive },
      excluded: false,
    },
    orderBy: { date: "asc" },
    select: {
      id: true,
      date: true,
      description: true,
      reference: true,
      amount: true,
      type: true,
      matchedRecordType: true,
      reconciliationId: true,
    },
  });

  const lines: ReconcileTxn[] = txns.map((t) => ({
    id: t.id,
    date: t.date.toISOString(),
    description: t.description,
    reference: t.reference,
    amount: Number(t.amount),
    type: t.type === "CREDIT" ? "CREDIT" : "DEBIT",
    isMatched: t.matchedRecordType !== null,
    cleared: t.reconciliationId === rec.id,
  }));

  const readOnly = rec.status !== "IN_PROGRESS";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <BackLink href={`/banking/accounts/${account.id}/reconcile`}><ArrowLeft className="h-4 w-4" /></BackLink>
        </Button>
        <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Reconciling {account.name}
        </h1>
        <Badge
          variant={
            rec.status === "FINALISED"
              ? "secondary"
              : rec.status === "UNDONE"
                ? "outline"
                : "outline"
          }
        >
          {rec.status === "IN_PROGRESS"
            ? "In progress"
            : rec.status === "FINALISED"
              ? "Finalised"
              : "Undone"}
        </Badge>
      </div>

      <ReconcilePane
        reconciliationId={rec.id}
        bankAccountId={account.id}
        currency={account.currency}
        openingBalance={Number(rec.openingBalance)}
        closingBalance={Number(rec.closingBalance)}
        startDate={rec.startDate.toISOString()}
        endDate={rec.endDate.toISOString()}
        txns={lines}
        readOnly={readOnly}
      />
    </div>
  );
}
