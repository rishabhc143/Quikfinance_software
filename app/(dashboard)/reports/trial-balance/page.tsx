import Link from "next/link";
import { ArrowLeft, AlertCircle, Download } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import {
  aggregateLedgerLines,
  trialBalanceImbalance,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";

export const metadata = { title: "Trial Balance" };

const TYPE_LABEL: Record<AccountBucket, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  INCOME: "Income",
  OTHER_INCOME: "Other Income",
  EXPENSE: "Expenses",
  COST_OF_GOODS_SOLD: "Cost of Goods Sold",
  OTHER_EXPENSE: "Other Expenses",
};

const TYPE_ORDER: AccountBucket[] = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "INCOME",
  "OTHER_INCOME",
  "EXPENSE",
  "COST_OF_GOODS_SOLD",
  "OTHER_EXPENSE",
];

/**
 * RPT-A — Trial Balance. Aggregates every JournalEntryLine into one
 * row per ChartOfAccount, sorted by accounting type then code.
 *
 * The "imbalance" line at the bottom is expected to be non-zero in
 * v1 because many domain records (Invoice, Bill, etc.) don't yet
 * post to the JE. That stays surfaced so users can spot real
 * misposts vs the known gap. RPT-B will close the gap.
 */
export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams?: { asOf?: string };
}) {
  const { organization } = await requireOrganization();
  const cur = organization.currency;
  const asOf = searchParams?.asOf ? new Date(searchParams.asOf) : new Date();

  const lines = await db.journalEntryLine.findMany({
    where: {
      journalEntry: {
        organizationId: organization.id,
        date: { lte: asOf },
      },
    },
    select: {
      debit: true,
      credit: true,
      accountId: true,
      account: {
        select: { id: true, name: true, code: true, type: true },
      },
    },
  });

  const rows = aggregateLedgerLines(
    lines.map((l) => ({
      account: {
        id: l.account.id,
        name: l.account.name,
        code: l.account.code,
        type: l.account.type as AccountBucket,
      },
      debit: Number(l.debit),
      credit: Number(l.credit),
    }))
  );

  // Stable sort: account type bucket, then code (numeric where possible), then name.
  rows.sort((a, b) => {
    const ta = TYPE_ORDER.indexOf(a.accountType);
    const tb = TYPE_ORDER.indexOf(b.accountType);
    if (ta !== tb) return ta - tb;
    const ca = a.accountCode ?? "";
    const cb = b.accountCode ?? "";
    if (ca !== cb) return ca.localeCompare(cb, undefined, { numeric: true });
    return a.accountName.localeCompare(b.accountName);
  });

  const totalDebit = rows.reduce((s, r) => s + r.totalDebit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.totalCredit, 0);
  const imbalance = trialBalanceImbalance(rows);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/reports">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Trial Balance</h1>
          <p className="text-sm text-muted-foreground">
            As of {format(asOf, "dd MMM yyyy")}
          </p>
        </div>
        <div className="ml-auto">
          <Button asChild variant="outline" size="sm" className="gap-1">
            <a
              href={`/reports/trial-balance/export?asOf=${asOf
                .toISOString()
                .slice(0, 10)}`}
            >
              <Download className="h-4 w-4" /> Download CSV
            </a>
          </Button>
        </div>
      </div>

      <form
        className="flex items-center gap-2 text-sm"
        action="/reports/trial-balance"
      >
        <label>
          As of{" "}
          <input
            type="date"
            name="asOf"
            defaultValue={format(asOf, "yyyy-MM-dd")}
            className="ml-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
        <Button type="submit" size="sm" variant="outline">
          Apply
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account balances</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-8 text-sm text-center text-muted-foreground">
              No journal entries posted yet. As you Categorise bank lines
              (BNK-D) or post Manual Journals, accounts will appear here.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Code</th>
                  <th className="text-left p-3">Account</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-right p-3">Debit</th>
                  <th className="text-right p-3">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.accountId}>
                    <td className="p-3 font-mono text-xs">
                      {r.accountCode ?? "—"}
                    </td>
                    <td className="p-3">{r.accountName}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {TYPE_LABEL[r.accountType]}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {r.totalDebit > 0 ? formatMoney(r.totalDebit, cur) : ""}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {r.totalCredit > 0 ? formatMoney(r.totalCredit, cur) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30">
                <tr>
                  <td colSpan={3} className="p-3 font-medium">
                    Totals
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold">
                    {formatMoney(totalDebit, cur)}
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold">
                    {formatMoney(totalCredit, cur)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      {imbalance > 0.005 ? (
        <Card className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="pt-6 text-sm flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium text-amber-900 dark:text-amber-200">
                Imbalance: {formatMoney(imbalance, cur)}
              </div>
              <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-1">
                Not every domain record posts to the ledger yet — invoices,
                bills, and payment receipts will be wired in RPT-B. Bank
                Categorise (BNK-D) and Transaction Rule fires (BNK-E)
                already do. The gap above is the unposted amount, not a bug.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : rows.length > 0 ? (
        <Card className="border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="pt-6 text-sm text-emerald-900 dark:text-emerald-200">
            Balanced — debits equal credits.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
