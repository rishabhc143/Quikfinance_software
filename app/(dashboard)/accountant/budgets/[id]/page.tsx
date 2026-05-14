import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, Target, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionFormButton } from "@/components/shared/action-form-button";
import { formatMoney } from "@/lib/money";
import {
  computeVariance,
  isCreditNaturalAccount,
  monthlyBucketsForYear,
} from "@/lib/accounting/budgets";
import { deleteBudgetByIdAction } from "../actions";

export const metadata = { title: "Budget" };

const TYPE_LABEL: Record<string, string> = {
  INCOME: "Income",
  OTHER_INCOME: "Other Income",
  EXPENSE: "Expense",
  OTHER_EXPENSE: "Other Expense",
  COST_OF_GOODS_SOLD: "COGS",
};

/**
 * ACCT-D — Budget detail. Renders a Budget vs Actuals table:
 *   one row per budgeted account; columns are Annual Budget,
 *   YTD Actual, Variance, Variance %.
 *
 * Actuals are the sum of JE-line amounts for the budget's fiscal-
 * year window, signed per the account's natural side (income +
 * other_income are credit-natural, everything else debit-natural).
 */
export default async function BudgetDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();

  const budget = await db.budget.findFirst({
    where: { id: params.id, organizationId: organization.id },
    include: {
      lines: {
        include: {
          account: { select: { id: true, name: true, code: true, type: true } },
        },
        orderBy: [{ accountId: "asc" }, { periodStart: "asc" }],
      },
    },
  });
  if (!budget) notFound();

  // Roll the 12-row monthly lines back into one (account → annual)
  // bucket so the table is one row per account.
  type Row = {
    accountId: string;
    accountCode: string | null;
    accountName: string;
    accountType: string;
    budgeted: number;
  };
  const rowsByAccount = new Map<string, Row>();
  for (const l of budget.lines) {
    const existing = rowsByAccount.get(l.accountId);
    const amount = Number(l.amount);
    if (existing) {
      existing.budgeted += amount;
    } else {
      rowsByAccount.set(l.accountId, {
        accountId: l.accountId,
        accountCode: l.account.code,
        accountName: l.account.name,
        accountType: l.account.type,
        budgeted: amount,
      });
    }
  }
  const accountRows = Array.from(rowsByAccount.values()).sort((a, b) =>
    (a.accountCode ?? a.accountName).localeCompare(
      b.accountCode ?? b.accountName
    )
  );

  // FY window — first bucket start, last bucket end.
  const buckets = monthlyBucketsForYear(
    budget.fiscalYear,
    organization.fiscalYearStart
  );
  const fyStart = buckets[0].start;
  const fyEnd = buckets[11].end;

  // One grouped query for actuals.
  const accountIds = accountRows.map((r) => r.accountId);
  const sums = accountIds.length
    ? await db.journalEntryLine.groupBy({
        by: ["accountId"],
        where: {
          accountId: { in: accountIds },
          journalEntry: {
            organizationId: organization.id,
            date: { gte: fyStart, lte: fyEnd },
          },
        },
        _sum: { debit: true, credit: true },
      })
    : [];
  const sumsByAccount = new Map<string, { debit: number; credit: number }>();
  for (const s of sums) {
    sumsByAccount.set(s.accountId, {
      debit: Number(s._sum.debit ?? 0),
      credit: Number(s._sum.credit ?? 0),
    });
  }

  const tableRows = accountRows.map((r) => {
    const sum = sumsByAccount.get(r.accountId) ?? { debit: 0, credit: 0 };
    const isCredit = isCreditNaturalAccount(
      r.accountType as Parameters<typeof isCreditNaturalAccount>[0]
    );
    const actual = isCredit ? sum.credit - sum.debit : sum.debit - sum.credit;
    const { variance, pct } = computeVariance(r.budgeted, actual);
    // Coloring rule: for income (credit-natural) accounts, OVER budget
    // is good (positive variance = green). For expense / COGS, OVER
    // budget is bad (positive variance = red). We expose `goodSign`
    // so the cell can pick a colour.
    const goodSign: 1 | -1 = isCredit ? 1 : -1;
    return { ...r, actual, variance, pct, goodSign };
  });

  const totalBudgeted = tableRows.reduce((s, r) => s + r.budgeted, 0);
  const totalActual = tableRows.reduce((s, r) => s + r.actual, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/accountant/budgets">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Target className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">{budget.name}</h1>
        <Badge variant="outline" className="font-mono text-xs">
          FY{String(budget.fiscalYear).slice(-2)}
        </Badge>
        <div className="ml-auto">
          <ActionFormButton
            action={deleteBudgetByIdAction.bind(null, budget.id)}
            label="Delete"
            icon={<Trash2 className="h-4 w-4" />}
            variant="outline"
            size="sm"
            successToast="Budget deleted"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Period</div>
              <div className="font-medium">
                {format(fyStart, "dd MMM yyyy")} →{" "}
                {format(fyEnd, "dd MMM yyyy")}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Budgeted</div>
              <div className="font-semibold tabular-nums">
                {formatMoney(totalBudgeted, organization.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Actual (in window)
              </div>
              <div className="font-semibold tabular-nums">
                {formatMoney(totalActual, organization.currency)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Budget vs Actuals</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {tableRows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No accounts on this budget.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Code</th>
                  <th className="text-left p-3">Account</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-right p-3">Annual Budget</th>
                  <th className="text-right p-3">YTD Actual</th>
                  <th className="text-right p-3">Variance</th>
                  <th className="text-right p-3">Variance %</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tableRows.map((r) => {
                  const varSign = Math.sign(r.variance) as 0 | 1 | -1;
                  // Colour: a "good" variance for this account type
                  // is green; the opposite is red. Zero is neutral.
                  // varSign==0 falls through both checks to the
                  // empty class (no colouring).
                  const isGood = varSign === r.goodSign;
                  const isBad = varSign === -r.goodSign;
                  const varClass = isGood
                    ? "text-emerald-600"
                    : isBad
                      ? "text-destructive"
                      : "";
                  return (
                    <tr key={r.accountId}>
                      <td className="p-3 font-mono text-xs">
                        {r.accountCode ?? "—"}
                      </td>
                      <td className="p-3">{r.accountName}</td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {TYPE_LABEL[r.accountType] ?? r.accountType}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMoney(r.budgeted, organization.currency)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMoney(r.actual, organization.currency)}
                      </td>
                      <td
                        className={"p-3 text-right tabular-nums " + varClass}
                      >
                        {r.variance >= 0 ? "+" : "−"}
                        {formatMoney(
                          Math.abs(r.variance),
                          organization.currency
                        )}
                      </td>
                      <td
                        className={"p-3 text-right tabular-nums " + varClass}
                      >
                        {r.pct === null
                          ? "—"
                          : `${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/20">
                <tr>
                  <td colSpan={3} className="p-3 text-right font-medium">
                    Totals
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold">
                    {formatMoney(totalBudgeted, organization.currency)}
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold">
                    {formatMoney(totalActual, organization.currency)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
