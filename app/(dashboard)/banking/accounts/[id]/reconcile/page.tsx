import { notFound } from "next/navigation";
import Link from "next/link";
import { BackLink } from "@/components/shared/dirty-form-nav";
import { format } from "date-fns";
import {
  ArrowLeft,
  CheckCircle2,
  Plus,
  Eye,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ActionFormButton } from "@/components/shared/action-form-button";
import { formatMoney } from "@/lib/money";
import { undoByIdAction, deleteByIdAction } from "./actions";

export const metadata = { title: "Reconciliations" };

const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "In progress",
  FINALISED: "Finalised",
  UNDONE: "Undone",
};

/**
 * BNK-F — List of reconciliations on this bank account, newest first.
 * Each row links to the two-pane detail (read-only for FINALISED /
 * UNDONE; editable for IN_PROGRESS). Per-row Undo / Delete actions.
 */
export default async function BankAccountReconciliationsListPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();

  const account = await db.bankAccount.findFirst({
    where: { id: params.id, organizationId: organization.id },
    select: { id: true, name: true, currency: true },
  });
  if (!account) notFound();

  const rows = await db.reconciliation.findMany({
    where: { bankAccountId: account.id, organizationId: organization.id },
    orderBy: { createdAt: "desc" },
    include: {
      finalisedBy: { select: { name: true, email: true } },
      _count: { select: { transactions: true } },
    },
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <BackLink href={`/banking/accounts/${account.id}`}><ArrowLeft className="h-4 w-4" /></BackLink>
        </Button>
        <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Reconciliations
        </h1>
        <span className="text-sm text-muted-foreground ml-2">
          for {account.name}
        </span>
        <div className="ml-auto">
          <Button asChild className="gap-1">
            <Link href={`/banking/accounts/${account.id}/reconcile/new`}>
              <Plus className="h-4 w-4" /> New Reconciliation
            </Link>
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="pt-10 pb-10 text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 mx-auto text-muted-foreground" />
            <div className="text-sm font-medium">No reconciliations yet.</div>
            <p className="text-sm text-muted-foreground">
              Initiate the first one to lock your matched transactions
              against the bank&apos;s statement closing balance.
            </p>
            <Button asChild className="gap-1 mt-2">
              <Link href={`/banking/accounts/${account.id}/reconcile/new`}>
                <Plus className="h-4 w-4" /> Start Reconciliation
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Period</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Opening</th>
                    <th className="p-3 text-right">Closing</th>
                    <th className="p-3">Cleared</th>
                    <th className="p-3">Finalised</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="p-3">
                        <Link
                          href={`/banking/accounts/${account.id}/reconcile/${r.id}`}
                          className="text-primary hover:underline"
                        >
                          {format(r.startDate, "dd MMM yyyy")} →{" "}
                          {format(r.endDate, "dd MMM yyyy")}
                        </Link>
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={
                            r.status === "FINALISED"
                              ? "secondary"
                              : r.status === "IN_PROGRESS"
                                ? "default"
                                : "outline"
                          }
                          className="text-[10px]"
                        >
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMoney(Number(r.openingBalance), account.currency)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMoney(Number(r.closingBalance), account.currency)}
                      </td>
                      <td className="p-3 text-xs">
                        {r._count.transactions} txn
                        {r._count.transactions === 1 ? "" : "s"}
                      </td>
                      <td className="p-3 text-xs">
                        {r.finalisedAt
                          ? `${format(r.finalisedAt, "dd MMM yyyy")} · ${
                              r.finalisedBy?.name ?? r.finalisedBy?.email ?? "—"
                            }`
                          : "—"}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="sm">
                            <Link
                              href={`/banking/accounts/${account.id}/reconcile/${r.id}`}
                              aria-label="Open reconciliation"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          {r.status !== "UNDONE" ? (
                            <ActionFormButton
                              action={undoByIdAction.bind(null, r.id)}
                              label=""
                              icon={<RotateCcw className="h-3.5 w-3.5" />}
                              variant="ghost"
                              size="sm"
                              successToast="Reconciliation undone"
                            />
                          ) : null}
                          {r.status !== "FINALISED" ? (
                            <ActionFormButton
                              action={deleteByIdAction.bind(null, r.id)}
                              label=""
                              icon={<Trash2 className="h-3.5 w-3.5" />}
                              variant="ghost"
                              size="sm"
                              successToast="Reconciliation deleted"
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
