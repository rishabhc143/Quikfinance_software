import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, Undo2, Wallet, CreditCard, GitMerge, Link2Off } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ActionFormButton } from "@/components/shared/action-form-button";
import { formatMoney } from "@/lib/money";
import { undoLastImportAction } from "./actions";
import { unmatchByIdAction } from "./match/actions";

const MATCH_TYPE_LABEL: Record<string, string> = {
  INVOICE: "Invoice",
  BILL: "Bill",
  PAYMENT_RECEIVED: "Payment Received",
  PAYMENT_MADE: "Payment Made",
  EXPENSE: "Expense",
  // BNK-D — Categorise Money In creates a JournalEntry directly.
  JOURNAL_ENTRY: "Journal Entry",
};

export const metadata = { title: "Bank Account" };

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  BANK: "Bank",
  CREDIT_CARD: "Credit Card",
  PAYPAL: "PayPal",
};

const PAGE_SIZE = 50;

export default async function BankAccountDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { page?: string };
}) {
  const { organization } = await requireOrganization();
  const page = Math.max(1, Number(searchParams?.page ?? "1"));

  const account = await db.bankAccount.findFirst({
    where: { id: params.id, organizationId: organization.id },
  });
  if (!account) notFound();

  const [transactions, total, lastBatch] = await Promise.all([
    db.bankTransaction.findMany({
      where: { bankAccountId: account.id },
      orderBy: { date: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.bankTransaction.count({
      where: { bankAccountId: account.id },
    }),
    db.bankImportBatch.findFirst({
      where: { bankAccountId: account.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const Icon = account.type === "CREDIT_CARD" ? CreditCard : Wallet;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/banking">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Icon className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
        <Badge variant="outline">
          {ACCOUNT_TYPE_LABEL[account.type] ?? account.type}
        </Badge>
        {account.isPrimary ? (
          <Badge variant="secondary">Primary</Badge>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="outline" className="gap-1">
            <Link href={`/banking/accounts/${account.id}/match`}>
              <GitMerge className="h-4 w-4" /> Match Transactions
            </Link>
          </Button>
          <Button asChild className="gap-1">
            <Link href={`/banking/accounts/${account.id}/import`}>
              <Upload className="h-4 w-4" /> Import Statement
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                ⋯
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="p-0"
                asChild
                disabled={!lastBatch}
              >
                <div className="px-1 py-0.5 w-full">
                  <ActionFormButton
                    action={undoLastImportAction.bind(null, account.id)}
                    label={
                      lastBatch
                        ? `Undo Last Import (${lastBatch.rowCount} rows)`
                        : "No imports to undo"
                    }
                    variant="ghost"
                    size="sm"
                    icon={<Undo2 className="h-4 w-4" />}
                    successToast="Last import undone"
                  />
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">
              Opening balance
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatMoney(Number(account.openingBalance), account.currency)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Transactions</div>
            <div className="text-2xl font-semibold tabular-nums">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Last import</div>
            <div className="text-sm font-medium">
              {lastBatch
                ? `${lastBatch.fileName} · ${format(
                    lastBatch.createdAt,
                    "dd MMM yyyy"
                  )}`
                : "—"}
            </div>
            {lastBatch && lastBatch.duplicateCount > 0 ? (
              <div className="text-xs text-amber-600 mt-1">
                {lastBatch.duplicateCount} duplicate
                {lastBatch.duplicateCount === 1 ? "" : "s"} flagged
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
                <tr className="text-left">
                  <th className="p-3">Date</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Reference</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-8 text-center text-muted-foreground"
                    >
                      No transactions yet. Click{" "}
                      <Link
                        href={`/banking/accounts/${account.id}/import`}
                        className="text-primary hover:underline"
                      >
                        Import Statement
                      </Link>{" "}
                      to upload a CSV.
                    </td>
                  </tr>
                ) : (
                  transactions.map((t) => (
                    <tr
                      key={t.id}
                      className={t.excluded ? "opacity-50" : undefined}
                    >
                      <td className="p-3 text-xs">
                        {format(t.date, "dd MMM yyyy")}
                      </td>
                      <td className="p-3">{t.description ?? "—"}</td>
                      <td className="p-3 font-mono text-xs">
                        {t.reference ?? "—"}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMoney(Number(t.amount), account.currency)}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={t.type === "CREDIT" ? "secondary" : "outline"}
                        >
                          {t.type}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs">
                        {t.excluded ? (
                          <span
                            className="text-amber-700 dark:text-amber-400"
                            title={t.excludedReason ?? ""}
                          >
                            Excluded
                          </span>
                        ) : t.isReconciled ? (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            Reconciled
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        {t.matchedRecordType ? (
                          <div className="flex items-center gap-1">
                            <span className="text-emerald-700 dark:text-emerald-400">
                              {MATCH_TYPE_LABEL[t.matchedRecordType] ??
                                t.matchedRecordType}
                            </span>
                            {!t.isReconciled ? (
                              <ActionFormButton
                                action={unmatchByIdAction.bind(null, t.id)}
                                label=""
                                icon={<Link2Off className="h-3 w-3" />}
                                variant="ghost"
                                size="sm"
                                successToast="Unmatched"
                              />
                            ) : null}
                          </div>
                        ) : t.excluded ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Link
                            href={`/banking/accounts/${account.id}/match?txn=${t.id}`}
                            className="text-primary hover:underline"
                          >
                            Match
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {pageCount} · {total} total
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/banking/accounts/${account.id}?page=${page - 1}`}
                >
                  Previous
                </Link>
              </Button>
            ) : null}
            {page < pageCount ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/banking/accounts/${account.id}?page=${page + 1}`}
                >
                  Next
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
