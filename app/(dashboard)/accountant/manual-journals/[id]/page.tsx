import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, FileText, Trash2 } from "lucide-react";
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

/**
 * ACCT-A — Manual Journal detail. Shows the header + the linked JE's
 * lines. Delete unwinds both rows atomically (see actions.ts).
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

  // Look up the linked JE via the structured reference key.
  const je = await db.journalEntry.findFirst({
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
  });

  const totalDebit =
    je?.lines.reduce((s, l) => s + Number(l.debit), 0) ?? 0;
  const totalCredit =
    je?.lines.reduce((s, l) => s + Number(l.credit), 0) ?? 0;

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
        <CardContent className="pt-6 space-y-2">
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
              {je ? (
                <Badge variant="secondary">Posted</Badge>
              ) : (
                <Badge variant="outline" title="Header without lines — pre-ACCT-A legacy row">
                  Header only
                </Badge>
              )}
            </div>
          </div>
          {header.notes ? (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground">Notes</div>
              <div className="text-sm whitespace-pre-wrap">{header.notes}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {je && je.lines.length > 0 ? (
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
                {je.lines.map((l) => (
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
              No JE lines linked.{" "}
              {header.createdAt < new Date("2026-05-13T00:00:00Z")
                ? "This is a pre-ACCT-A legacy header — delete + recreate to attach proper double-entry lines."
                : "Something went wrong on create — please report."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
