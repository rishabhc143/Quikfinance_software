import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowLeft,
  Pencil,
  Archive,
  RotateCcw,
  Lock,
  BookOpen,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionFormButton } from "@/components/shared/action-form-button";
import { formatMoney } from "@/lib/money";
import { parseJeReference } from "@/lib/accounting/parse-je-reference";
import {
  archiveAccountByIdAction,
  restoreAccountByIdAction,
} from "../actions";

export const metadata = { title: "Account" };

const TYPE_LABELS: Record<string, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
  COST_OF_GOODS_SOLD: "Cost of Goods Sold",
  OTHER_INCOME: "Other Income",
  OTHER_EXPENSE: "Other Expense",
};

/**
 * ACCT-E — Chart of Accounts detail page.
 *
 * Shows the account header (name, code, type, subType, parent,
 * status, system/user flag, description) plus a recent ledger
 * preview (last 50 JE lines posted to this account, newest
 * first). Empty state when no postings have hit it yet.
 *
 * The Edit / Archive / Restore buttons in the header mirror what
 * the list-page row exposes — gives the user a single place to
 * inspect + manage one account.
 */
export default async function AccountDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();

  const account = await db.chartOfAccount.findFirst({
    where: { id: params.id, organizationId: organization.id },
    include: {
      parent: { select: { id: true, name: true, code: true } },
    },
  });
  if (!account) notFound();

  const isSystemAccount = account.code?.startsWith("SYS-") ?? false;

  // Recent ledger preview — last 50 JE lines, newest first.
  const lines = await db.journalEntryLine.findMany({
    where: {
      accountId: account.id,
      journalEntry: { organizationId: organization.id },
    },
    include: {
      journalEntry: {
        select: { id: true, date: true, reference: true, notes: true },
      },
    },
    orderBy: { journalEntry: { date: "desc" } },
    take: 50,
  });

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/accountant/chart-of-accounts">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <BookOpen className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">{account.name}</h1>
        {isSystemAccount && (
          <Badge variant="outline" className="text-[10px]">
            <Lock className="h-3 w-3 mr-1" /> System
          </Badge>
        )}
        {!account.isActive && (
          <Badge variant="secondary" className="text-[10px]">
            Archived
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link
              href={`/accountant/chart-of-accounts/${account.id}/edit`}
              aria-label="Edit account"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          </Button>
          {account.isActive ? (
            <ActionFormButton
              action={archiveAccountByIdAction.bind(null, account.id)}
              label="Archive"
              icon={<Archive className="h-4 w-4" />}
              variant="outline"
              size="sm"
              successToast="Account archived"
            />
          ) : (
            <ActionFormButton
              action={restoreAccountByIdAction.bind(null, account.id)}
              label="Restore"
              icon={<RotateCcw className="h-4 w-4" />}
              variant="outline"
              size="sm"
              successToast="Account restored"
            />
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Account Type</div>
              <div className="font-medium">
                {account.subType ?? TYPE_LABELS[account.type] ?? account.type}
                {account.subType && (
                  <span className="text-xs text-muted-foreground ml-1">
                    · {TYPE_LABELS[account.type] ?? account.type}
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Code</div>
              <div className="font-mono text-sm">
                {account.code ?? (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <div>
                {account.isActive ? (
                  <Badge variant="secondary">Active</Badge>
                ) : (
                  <Badge variant="outline">Archived</Badge>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Parent Account</div>
              <div className="text-sm">
                {account.parent ? (
                  <Link
                    href={`/accountant/chart-of-accounts/${account.parent.id}`}
                    className="text-primary hover:underline"
                  >
                    {account.parent.code ? `${account.parent.code} · ` : ""}
                    {account.parent.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Created</div>
              <div className="text-sm">
                {format(account.createdAt, "dd MMM yyyy")}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Postings</div>
              <div className="tabular-nums">{lines.length}</div>
            </div>
          </div>
          {account.description && (
            <div className="border-t pt-3 mt-3">
              <div className="text-xs text-muted-foreground">Description</div>
              <div className="text-sm whitespace-pre-wrap">
                {account.description}
              </div>
            </div>
          )}
          {isSystemAccount && (
            <div className="border-t pt-3 mt-3 text-xs text-muted-foreground">
              This is a <b>system account</b> — the posting code references
              it by its <code className="font-mono">{account.code}</code> code,
              so the name + type can be edited but the account can&apos;t be
              archived or deleted.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Recent ledger
            <span className="text-xs text-muted-foreground font-normal ml-2">
              (last {lines.length} posting{lines.length === 1 ? "" : "s"})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lines.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">
              No ledger activity yet — this account hasn&apos;t been touched
              by any posting.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Source</th>
                  <th className="text-left p-3">Description</th>
                  <th className="text-right p-3">Debit</th>
                  <th className="text-right p-3">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l) => {
                  const ref = parseJeReference(l.journalEntry.reference);
                  return (
                    <tr key={l.id}>
                      <td className="p-3 whitespace-nowrap">
                        {format(l.journalEntry.date, "dd MMM yyyy")}
                      </td>
                      <td className="p-3 text-xs">
                        {ref ? (
                          ref.sourceHref ? (
                            <Link
                              href={ref.sourceHref}
                              className="text-primary hover:underline"
                            >
                              {ref.label}
                            </Link>
                          ) : (
                            ref.label
                          )
                        ) : (
                          <span className="font-mono text-muted-foreground">
                            {l.journalEntry.reference ?? "—"}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground truncate max-w-[280px]">
                        {l.description ?? l.journalEntry.notes ?? "—"}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {Number(l.debit) > 0
                          ? formatMoney(Number(l.debit), organization.currency)
                          : ""}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {Number(l.credit) > 0
                          ? formatMoney(Number(l.credit), organization.currency)
                          : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/20">
                <tr>
                  <td colSpan={3} className="p-3 text-right font-medium">
                    Totals (in window)
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold">
                    {formatMoney(totalDebit, organization.currency)}
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold">
                    {formatMoney(totalCredit, organization.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
