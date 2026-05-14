import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, Globe, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionFormButton } from "@/components/shared/action-form-button";
import { formatMoney } from "@/lib/money";
import { currencyAdjustmentReference } from "@/lib/accounting/currency-adjustment";
import { deleteCurrencyAdjustmentByIdAction } from "../actions";

export const metadata = { title: "Currency Adjustment" };

const TYPE_LABEL: Record<string, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
  COST_OF_GOODS_SOLD: "COGS",
  OTHER_INCOME: "Other Income",
  OTHER_EXPENSE: "Other Expense",
};

/**
 * ACCT-C — Detail page for a Currency Adjustment. Loads the header
 * plus the CADJ:<id> JE lines so the user can see the exact ledger
 * impact (gain vs loss legs vs the adjusted accounts).
 */
export default async function CurrencyAdjustmentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();

  const header = await db.currencyAdjustment.findFirst({
    where: { id: params.id, organizationId: organization.id },
  });
  if (!header) notFound();

  const je = await db.journalEntry.findFirst({
    where: {
      organizationId: organization.id,
      reference: currencyAdjustmentReference(header.id),
    },
    include: {
      lines: {
        include: {
          account: {
            select: { id: true, name: true, code: true, type: true },
          },
        },
      },
    },
  });

  const lines = je?.lines ?? [];
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
  let net = 0;
  for (const l of lines) {
    if (l.account.code === "SYS-FX-GAIN") net += Number(l.credit);
    else if (l.account.code === "SYS-FX-LOSS") net -= Number(l.debit);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/accountant/currency-adjustments">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Globe className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">
          Currency Adjustment{" "}
          <span className="font-mono text-base text-muted-foreground">
            {header.number}
          </span>
        </h1>
        <div className="ml-auto">
          <ActionFormButton
            action={deleteCurrencyAdjustmentByIdAction.bind(null, header.id)}
            label="Delete"
            icon={<Trash2 className="h-4 w-4" />}
            variant="outline"
            size="sm"
            successToast="Currency adjustment deleted"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="grid gap-3 md:grid-cols-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Date</div>
              <div className="font-medium">
                {format(header.date, "dd MMM yyyy")}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Currency</div>
              <Badge variant="outline" className="font-mono">
                {header.currency}
              </Badge>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Exchange rate</div>
              <div className="text-sm">
                {header.exchangeRate ? (
                  String(header.exchangeRate)
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Net P&amp;L impact</div>
              <div
                className={
                  "font-semibold " +
                  (net >= 0 ? "text-emerald-600" : "text-destructive")
                }
              >
                {net >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(net), organization.currency)}{" "}
                <span className="text-xs font-normal">
                  ({net >= 0 ? "gain" : "loss"})
                </span>
              </div>
            </div>
          </div>
          {header.notes ? (
            <div className="border-t pt-3">
              <div className="text-xs text-muted-foreground">Notes</div>
              <div className="text-sm whitespace-pre-wrap">{header.notes}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posted lines</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lines.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Code</th>
                  <th className="text-left p-3">Account</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Description</th>
                  <th className="text-right p-3">Debit</th>
                  <th className="text-right p-3">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="p-3 font-mono text-xs">
                      {l.account.code ?? "—"}
                    </td>
                    <td className="p-3">{l.account.name}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {TYPE_LABEL[l.account.type] ?? l.account.type}
                    </td>
                    <td className="p-3 text-xs">{l.description ?? "—"}</td>
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
                ))}
              </tbody>
              <tfoot className="bg-muted/20">
                <tr>
                  <td colSpan={4} className="p-3 text-right font-medium">
                    Totals
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
          ) : (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No JE lines linked — something went wrong on create, please
              report.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
