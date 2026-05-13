import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, FileText, Trash2, RotateCcw } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionFormButton } from "@/components/shared/action-form-button";
import { formatMoney } from "@/lib/money";
import { deleteManualJournalByIdAction } from "../actions";

export const metadata = { title: "Manual Journal" };

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

const REPORTING_METHOD_LABEL: Record<string, string> = {
  ACCRUAL_AND_CASH: "Accrual and Cash",
  ACCRUAL_ONLY: "Accrual Only",
  CASH_ONLY: "Cash Only",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
};

/**
 * ACCT-A.2 — Detail page. Shows header (with all new Zoho-parity
 * fields) + the primary JE lines + (when present) a "Reverse posting"
 * panel showing the auto-reverse JE's lines.
 */
export default async function ManualJournalDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();

  const header = await db.manualJournal.findFirst({
    where: { id: params.id, organizationId: organization.id },
  });
  if (!header) notFound();

  const [primaryJe, reverseJe] = await Promise.all([
    db.journalEntry.findFirst({
      where: {
        organizationId: organization.id,
        reference: `MJ:${header.id}`,
      },
      include: {
        lines: {
          include: {
            account: { select: { id: true, name: true, code: true, type: true } },
          },
        },
      },
    }),
    db.journalEntry.findFirst({
      where: {
        organizationId: organization.id,
        reference: `MJ-REV:${header.id}`,
      },
      include: {
        lines: {
          include: {
            account: { select: { id: true, name: true, code: true, type: true } },
          },
        },
      },
    }),
  ]);

  const totalDebit =
    primaryJe?.lines.reduce((s, l) => s + Number(l.debit), 0) ?? 0;
  const totalCredit =
    primaryJe?.lines.reduce((s, l) => s + Number(l.credit), 0) ?? 0;

  const displayCurrency = header.currency ?? organization.currency;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/accountant/manual-journals">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <FileText className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">
          Manual Journal{" "}
          <span className="font-mono text-base text-muted-foreground">
            {header.number}
          </span>
        </h1>
        <div className="ml-auto">
          <ActionFormButton
            action={deleteManualJournalByIdAction.bind(null, header.id)}
            label="Delete"
            icon={<Trash2 className="h-4 w-4" />}
            variant="outline"
            size="sm"
            successToast="Manual journal deleted"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Date</div>
              <div className="font-medium">
                {format(header.date, "dd MMM yyyy")}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Number</div>
              <div className="font-mono">{header.number}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <Badge
                variant={
                  header.status === "PUBLISHED" ? "secondary" : "outline"
                }
              >
                {STATUS_LABEL[header.status] ?? header.status}
              </Badge>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Reference#</div>
              <div className="text-sm">
                {header.referenceNumber ? (
                  <span className="font-mono">{header.referenceNumber}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Reporting Method
              </div>
              <div className="text-sm">
                {REPORTING_METHOD_LABEL[header.reportingMethod] ??
                  header.reportingMethod}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Currency</div>
              <div className="text-sm">{displayCurrency}</div>
            </div>
            {header.reverseJournalDate ? (
              <div className="md:col-span-3">
                <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <RotateCcw className="h-3 w-3" />
                  Reverse Journal Date
                </div>
                <div className="text-sm">
                  {format(header.reverseJournalDate, "dd MMM yyyy")}
                  {header.publishReverseOnlyOnDate ? (
                    <span className="text-xs text-muted-foreground ml-2">
                      (publish-only-on-date checked)
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
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
          {primaryJe && primaryJe.lines.length > 0 ? (
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
                {primaryJe.lines.map((l) => (
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
                        ? formatMoney(Number(l.debit), displayCurrency)
                        : ""}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {Number(l.credit) > 0
                        ? formatMoney(Number(l.credit), displayCurrency)
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
                    {formatMoney(totalDebit, displayCurrency)}
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold">
                    {formatMoney(totalCredit, displayCurrency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No JE lines linked.{" "}
              {header.createdAt < new Date("2026-05-13T00:00:00Z")
                ? "Pre-ACCT-A legacy header — delete + recreate to attach proper double-entry lines."
                : "Something went wrong on create — please report."}
            </div>
          )}
        </CardContent>
      </Card>

      {reverseJe && reverseJe.lines.length > 0 ? (
        <Card className="border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10">
          <CardHeader>
            <CardTitle className="text-base inline-flex items-center gap-2">
              <RotateCcw className="h-4 w-4" /> Reverse posting
              <Badge variant="secondary" className="ml-1 font-normal">
                {format(reverseJe.date, "dd MMM yyyy")}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Code</th>
                  <th className="text-left p-3">Account</th>
                  <th className="text-right p-3">Debit</th>
                  <th className="text-right p-3">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reverseJe.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="p-3 font-mono text-xs">
                      {l.account.code ?? "—"}
                    </td>
                    <td className="p-3">{l.account.name}</td>
                    <td className="p-3 text-right tabular-nums">
                      {Number(l.debit) > 0
                        ? formatMoney(Number(l.debit), displayCurrency)
                        : ""}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {Number(l.credit) > 0
                        ? formatMoney(Number(l.credit), displayCurrency)
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
