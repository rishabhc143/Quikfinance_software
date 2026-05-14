import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Target, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionFormButton } from "@/components/shared/action-form-button";
import { formatMoney } from "@/lib/money";
import {
  computeVariance,
  isCreditNaturalAccount,
  bucketsForFiscalYear,
  isBudgetPeriod,
  fiscalYearLabel,
  type BudgetPeriod,
} from "@/lib/accounting/budgets";
import { deleteBudgetByIdAction } from "../actions";
import { BudgetGridEditor } from "./budget-grid-editor";

export const metadata = { title: "Budget" };

const TYPE_LABEL: Record<string, string> = {
  INCOME: "Income",
  OTHER_INCOME: "Other Income",
  EXPENSE: "Expense",
  OTHER_EXPENSE: "Other Expense",
  COST_OF_GOODS_SOLD: "COGS",
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
};

const PERIOD_LABEL: Record<BudgetPeriod, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

/**
 * ACCT-D.2 — Budget detail. The detail page now hosts an editable
 * per-period grid (rows = budgeted accounts, columns = period
 * buckets aligned to Budget.budgetPeriod). The read-only Budget vs
 * Actuals comparison stays below the grid.
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
          account: {
            select: { id: true, name: true, code: true, type: true },
          },
        },
        orderBy: [{ accountId: "asc" }, { periodStart: "asc" }],
      },
    },
  });
  if (!budget) notFound();

  const period: BudgetPeriod = isBudgetPeriod(budget.budgetPeriod)
    ? budget.budgetPeriod
    : "MONTHLY";

  const buckets = bucketsForFiscalYear(
    budget.fiscalYear,
    organization.fiscalYearStart,
    period
  );

  // Group lines by account, mapping periodStart → bucket index.
  // The buckets array is the source of truth for column order;
  // each account row holds an `amounts: number[]` parallel to it.
  type AcctMeta = {
    accountId: string;
    accountName: string;
    accountCode: string | null;
    accountType: string;
    amounts: number[]; // length = buckets.length
  };
  const byAccount = new Map<string, AcctMeta>();
  // Index lookup: ISO date of bucket.start → bucket index.
  const indexByStart = new Map<string, number>();
  buckets.forEach((b, i) =>
    indexByStart.set(b.start.toISOString().slice(0, 10), i)
  );

  for (const l of budget.lines) {
    const key = l.account.id;
    let row = byAccount.get(key);
    if (!row) {
      row = {
        accountId: key,
        accountName: l.account.name,
        accountCode: l.account.code,
        accountType: l.account.type,
        amounts: new Array(buckets.length).fill(0),
      };
      byAccount.set(key, row);
    }
    const dateKey = l.periodStart.toISOString().slice(0, 10);
    const idx = indexByStart.get(dateKey);
    if (idx !== undefined) {
      row.amounts[idx] = Number(l.amount);
    }
  }
  const accountRows = Array.from(byAccount.values()).sort((a, b) =>
    (a.accountCode ?? a.accountName).localeCompare(
      b.accountCode ?? b.accountName
    )
  );

  // ── Budget vs Actuals (read-only, below the grid) ──────────────
  const fyStart = buckets[0].start;
  const fyEnd = buckets[buckets.length - 1].end;
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

  const compareRows = accountRows.map((r) => {
    const sum = sumsByAccount.get(r.accountId) ?? { debit: 0, credit: 0 };
    const isCredit = isCreditNaturalAccount(
      r.accountType as Parameters<typeof isCreditNaturalAccount>[0]
    );
    const actual = isCredit ? sum.credit - sum.debit : sum.debit - sum.credit;
    const budgeted = r.amounts.reduce((s, a) => s + a, 0);
    const { variance, pct } = computeVariance(budgeted, actual);
    const goodSign: 1 | -1 = isCredit ? 1 : -1;
    return { ...r, budgeted, actual, variance, pct, goodSign };
  });

  const totalBudgeted = compareRows.reduce((s, r) => s + r.budgeted, 0);
  const totalActual = compareRows.reduce((s, r) => s + r.actual, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/accountant/budgets">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Target className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">{budget.name}</h1>
        <Badge variant="outline" className="font-mono text-xs">
          {fiscalYearLabel(
            budget.fiscalYear,
            organization.fiscalYearStart,
            "short"
          )}
        </Badge>
        <Badge variant="secondary" className="text-xs">
          {PERIOD_LABEL[period]}
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
                {fiscalYearLabel(
                  budget.fiscalYear,
                  organization.fiscalYearStart
                )}
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

      {/* ── Editable grid ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Budget Amounts</CardTitle>
        </CardHeader>
        <CardContent>
          {accountRows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No accounts on this budget.
            </div>
          ) : (
            <BudgetGridEditor
              budgetId={budget.id}
              bucketLabels={buckets.map((b) => b.label)}
              initialRows={accountRows}
              currencyCode={organization.currency}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Budget vs Actuals (read-only) ─────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Budget vs Actuals</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {compareRows.length === 0 ? (
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
                  <th className="text-right p-3">Budgeted</th>
                  <th className="text-right p-3">Actual (YTD)</th>
                  <th className="text-right p-3">Variance</th>
                  <th className="text-right p-3">Variance %</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {compareRows.map((r) => {
                  const varSign = Math.sign(r.variance) as 0 | 1 | -1;
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
