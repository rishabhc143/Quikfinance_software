import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ActivityTimeline } from "@/components/shared/activity-timeline";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteButton } from "@/components/shared/delete-button";
import { formatMoney } from "@/lib/money";
import {
  applyCreditNoteToInvoiceAction,
  refundCreditNoteAction,
  voidCreditNoteAction,
  deleteCreditNoteAction,
  reopenCreditNoteAction,
} from "../actions";
import { ApplyCreditDialog } from "./apply-dialog";
import { RefundCreditDialog } from "./refund-dialog";

export default async function CreditNoteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const cn = await db.creditNote.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: {
      contact: true,
      lineItems: { orderBy: { position: "asc" } },
      applications: { include: { invoice: true } },
      refunds: true,
    },
  });
  if (!cn) notFound();

  const auditLogs = await db.auditLog.findMany({
    where: {
      organizationId: organization.id,
      entityType: "CreditNote",
      entityId: cn.id,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { name: true, email: true } } },
  });

  const balance = Number(cn.total) - Number(cn.amountApplied) - Number(cn.amountRefunded);
  const ccy = cn.currency;

  const openInvoices = await db.invoice.findMany({
    where: {
      organizationId: organization.id,
      contactId: cn.contactId,
      deletedAt: null,
      status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
    },
    orderBy: { dueDate: "asc" },
    select: { id: true, number: true, total: true, amountPaid: true },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link href="/sales/credit-notes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold font-mono">{cn.number}</h1>
          <Badge variant="outline">{cn.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {cn.status === "OPEN" && balance > 0.0001 ? (
            <>
              <ApplyCreditDialog
                creditNoteId={cn.id}
                balance={balance}
                openInvoices={openInvoices.map((i) => ({
                  id: i.id,
                  number: i.number,
                  balance: Number(i.total) - Number(i.amountPaid),
                }))}
                action={applyCreditNoteToInvoiceAction}
                trigger={<Button size="sm">Apply to Invoice</Button>}
              />
              <RefundCreditDialog
                creditNoteId={cn.id}
                balance={balance}
                action={refundCreditNoteAction}
                trigger={
                  <Button size="sm" variant="outline">
                    Refund
                  </Button>
                }
              />
            </>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {cn.status !== "VOID" ? (
                <DropdownMenuItem asChild>
                  <form action={voidCreditNoteAction.bind(null, cn.id)}>
                    <button type="submit" className="w-full text-left">Mark as Void</button>
                  </form>
                </DropdownMenuItem>
              ) : null}
              {cn.status === "CLOSED" && balance > 0.0001 ? (
                <DropdownMenuItem asChild>
                  <form action={reopenCreditNoteAction.bind(null, cn.id)}>
                    <button type="submit" className="w-full text-left">Reopen</button>
                  </form>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <DeleteButton
            action={deleteCreditNoteAction.bind(null, cn.id)}
            confirmText="Delete this credit note?"
            redirectTo="/sales/credit-notes"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-3 text-sm md:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Customer
            </div>
            <Link href={`/sales/customers/${cn.contactId}`} className="font-medium hover:underline">
              {cn.contact.displayName}
            </Link>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Date
            </div>
            <div>{format(cn.date, "dd MMM yyyy")}</div>
            {cn.reason ? (
              <>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2">
                  Reason
                </div>
                <div>{cn.reason}</div>
              </>
            ) : null}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Balance
            </div>
            <div className="text-2xl font-semibold">{formatMoney(balance, ccy)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              of {formatMoney(Number(cn.total), ccy)}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Item</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">Rate</th>
                <th className="p-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {cn.lineItems.map((l) => (
                <tr key={l.id}>
                  <td className="p-2">
                    <div className="font-medium">{l.name}</div>
                    {l.description ? (
                      <div className="text-xs text-muted-foreground">{l.description}</div>
                    ) : null}
                  </td>
                  <td className="p-2 text-right tabular-nums">{l.quantity.toString()}</td>
                  <td className="p-2 text-right tabular-nums">
                    {formatMoney(Number(l.rate), ccy)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatMoney(Number(l.amount), ccy)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {cn.applications.length > 0 ? (
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-sm font-semibold mb-3">Applied to invoices</h2>
            <ul className="text-sm divide-y">
              {cn.applications.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <div className="font-mono">
                    <Link href={`/sales/invoices/${a.invoiceId}`} className="hover:underline">
                      {a.invoice.number}
                    </Link>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(a.appliedAt, "dd MMM yyyy")}
                  </div>
                  <div className="tabular-nums">{formatMoney(Number(a.amountApplied), ccy)}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {cn.refunds.length > 0 ? (
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-sm font-semibold mb-3">Refunds</h2>
            <ul className="text-sm divide-y">
              {cn.refunds.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <div>
                    <div>{format(r.refundDate, "dd MMM yyyy")}</div>
                    <div className="text-xs text-muted-foreground">{r.mode}</div>
                  </div>
                  <div className="tabular-nums">{formatMoney(Number(r.amount), ccy)}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Activity
        </h2>
        <ActivityTimeline
          entries={auditLogs.map((l) => ({
            id: l.id,
            action: l.action,
            createdAt: l.createdAt,
            userName: l.user?.name ?? l.user?.email ?? null,
            before: l.before,
            after: l.after,
          }))}
        />
      </section>
    </div>
  );
}
