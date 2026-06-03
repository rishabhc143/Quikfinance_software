import { notFound } from "next/navigation";
import { BackLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft, GitMerge } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { MatchPane, type UnmatchedLine, type GLAccountOption } from "./match-pane";

export const metadata = { title: "Match Transactions" };

/**
 * BNK-C — Server wrapper for the bank-line ↔ existing-record match flow.
 *
 * Loads:
 *   - the account header
 *   - all unmatched, non-excluded BankTransaction rows (so the left
 *     pane can show a queue of work)
 *
 * Candidate fetching is per-selected-row, so it stays in the client
 * via `listCandidatesAction`.
 */
export default async function MatchTransactionsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { txn?: string };
}) {
  const { organization } = await requireOrganization();

  const account = await db.bankAccount.findFirst({
    where: { id: params.id, organizationId: organization.id },
  });
  if (!account) notFound();

  const [txns, glAccounts] = await Promise.all([
    db.bankTransaction.findMany({
      where: {
        bankAccountId: account.id,
        matchedRecordType: null,
        excluded: false,
      },
      orderBy: { date: "desc" },
      select: {
        id: true,
        date: true,
        amount: true,
        type: true,
        description: true,
        reference: true,
      },
      take: 200,
    }),
    // BNK-D — both directions' valid GL types up front so the client
    // doesn't need a round-trip when the user opens the Categorise
    // sub-view. Active accounts only.
    db.chartOfAccount.findMany({
      where: {
        organizationId: organization.id,
        isActive: true,
        type: {
          in: ["EXPENSE", "COST_OF_GOODS_SOLD", "INCOME", "OTHER_INCOME"],
        },
      },
      select: { id: true, name: true, code: true, type: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
  ]);

  const unmatched: UnmatchedLine[] = txns.map((t) => ({
    id: t.id,
    date: t.date.toISOString(),
    amount: Number(t.amount),
    type: t.type === "CREDIT" ? "CREDIT" : "DEBIT",
    description: t.description,
    reference: t.reference,
  }));

  // Pre-select either the txn from the URL (if it's still unmatched) or
  // the first row in the queue.
  const initialTxnId =
    (searchParams?.txn && unmatched.some((u) => u.id === searchParams.txn)
      ? searchParams.txn
      : unmatched[0]?.id) ?? null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <BackLink href={`/banking/accounts/${account.id}`}><ArrowLeft className="h-4 w-4" /></BackLink>
        </Button>
        <GitMerge className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Match Transactions
        </h1>
        <span className="text-sm text-muted-foreground ml-2">
          for {account.name}
        </span>
      </div>
      <MatchPane
        bankAccountId={account.id}
        currency={account.currency}
        unmatched={unmatched}
        initialTxnId={initialTxnId}
        glAccounts={glAccounts as GLAccountOption[]}
      />
    </div>
  );
}
