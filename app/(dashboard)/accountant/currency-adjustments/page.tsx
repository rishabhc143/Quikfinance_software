import Link from "next/link";
import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { currencyAdjustmentReference } from "@/lib/accounting/currency-adjustment";
import { NewBaseCurrencyAdjustmentButton } from "./new-button";
import { PeriodFilter, type Period } from "./period-filter";

export const metadata = { title: "Base Currency Adjustments" };

function parsePeriod(s: string | undefined): Period {
  const valid: Period[] = [
    "this-month",
    "last-month",
    "this-quarter",
    "last-quarter",
    "this-year",
    "last-year",
    "all-time",
  ];
  return valid.includes(s as Period) ? (s as Period) : "this-month";
}

function rangeForPeriod(p: Period): { gte?: Date; lte?: Date } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (p) {
    case "this-month":
      return {
        gte: new Date(Date.UTC(y, m, 1)),
        lte: new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999)),
      };
    case "last-month":
      return {
        gte: new Date(Date.UTC(y, m - 1, 1)),
        lte: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)),
      };
    case "this-quarter": {
      const qStart = Math.floor(m / 3) * 3;
      return {
        gte: new Date(Date.UTC(y, qStart, 1)),
        lte: new Date(Date.UTC(y, qStart + 3, 0, 23, 59, 59, 999)),
      };
    }
    case "last-quarter": {
      const qStart = Math.floor(m / 3) * 3 - 3;
      return {
        gte: new Date(Date.UTC(y, qStart, 1)),
        lte: new Date(Date.UTC(y, qStart + 3, 0, 23, 59, 59, 999)),
      };
    }
    case "this-year":
      return {
        gte: new Date(Date.UTC(y, 0, 1)),
        lte: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)),
      };
    case "last-year":
      return {
        gte: new Date(Date.UTC(y - 1, 0, 1)),
        lte: new Date(Date.UTC(y - 1, 11, 31, 23, 59, 59, 999)),
      };
    case "all-time":
    default:
      return {};
  }
}

/**
 * ACCT-C.3 — Base Currency Adjustments list, matching Zoho's UX.
 *
 * Columns:  Date · Currency · Exchange Rate · Gain or Loss · Notes
 * Header:   "Find Accountants" link · "+ New" button
 * Filter:   "Filter By: This Month ▾" pill (period scope)
 *
 * Net P&L per row is hydrated from the linked CADJ:<id> JE so the
 * column is a real running total, not just the absolute amount
 * the user typed.
 */
export default async function BaseCurrencyAdjustmentsPage({
  searchParams,
}: {
  searchParams?: { period?: string };
}) {
  const { organization } = await requireOrganization();
  const period = parsePeriod(searchParams?.period);
  const range = rangeForPeriod(period);

  const where: Prisma.CurrencyAdjustmentWhereInput = {
    organizationId: organization.id,
    ...(range.gte || range.lte
      ? { date: { ...(range.gte && { gte: range.gte }), ...(range.lte && { lte: range.lte }) } }
      : {}),
  };

  const [rows, accounts] = await Promise.all([
    db.currencyAdjustment.findMany({
      where,
      orderBy: { date: "desc" },
    }),
    db.chartOfAccount.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true, name: true, code: true, type: true },
      orderBy: [{ type: "asc" }, { code: "asc" }, { name: "asc" }],
    }),
  ]);

  // Hydrate the net P&L impact per row from the CADJ:<id> JE.
  const refs = rows.map((r) => currencyAdjustmentReference(r.id));
  const jes = refs.length
    ? await db.journalEntry.findMany({
        where: {
          organizationId: organization.id,
          reference: { in: refs },
        },
        include: {
          lines: {
            select: {
              debit: true,
              credit: true,
              account: { select: { code: true } },
            },
          },
        },
      })
    : [];
  const netByRef = new Map<string, number>();
  for (const je of jes) {
    if (!je.reference) continue;
    let net = 0;
    for (const l of je.lines) {
      if (l.account.code === "SYS-FX-GAIN") net += Number(l.credit);
      else if (l.account.code === "SYS-FX-LOSS") net -= Number(l.debit);
    }
    netByRef.set(je.reference, net);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Base Currency Adjustments</h1>
        <NewBaseCurrencyAdjustmentButton
          accounts={accounts}
          baseCurrency={organization.currency}
        />
      </div>

      <div>
        <PeriodFilter current={period} />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-10 p-3" />
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Currency</th>
                <th className="text-left p-3">Exchange Rate</th>
                <th className="text-right p-3">Gain or Loss</th>
                <th className="text-left p-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-sm text-muted-foreground">
                    Record a Base Currency Adjustment to correct fluctuations in exchange rates
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const net = netByRef.get(currencyAdjustmentReference(r.id)) ?? 0;
                  const rate = r.exchangeRate ? Number(r.exchangeRate) : null;
                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="p-3">
                        <input type="checkbox" className="h-4 w-4" disabled />
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <Link
                          href={`/accountant/currency-adjustments/${r.id}`}
                          className="text-primary hover:underline"
                        >
                          {format(r.date, "dd/MM/yyyy")}
                        </Link>
                      </td>
                      <td className="p-3 font-mono text-xs">{r.currency}</td>
                      <td className="p-3 text-xs">
                        {rate !== null
                          ? `1 ${r.currency} = ${rate.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 6,
                            })} ${organization.currency}`
                          : "—"}
                      </td>
                      <td
                        className={
                          "p-3 text-right tabular-nums " +
                          (net >= 0 ? "text-emerald-600" : "text-destructive")
                        }
                      >
                        {net >= 0 ? "+" : "−"}
                        {formatMoney(Math.abs(net), organization.currency)}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground truncate max-w-[280px]">
                        {r.notes ?? "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
