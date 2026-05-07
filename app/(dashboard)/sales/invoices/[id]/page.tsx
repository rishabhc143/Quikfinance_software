import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Pencil, MoreHorizontal, DollarSign } from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteButton } from "@/components/shared/delete-button";
import { formatMoney } from "@/lib/money";
import {
  deleteInvoiceAction,
  markInvoiceSentAction,
  voidInvoiceAction,
  recordPaymentAction,
  sendInvoiceReminderAction,
  applyCreditsToInvoiceAction,
} from "../actions";
import { InvoiceActionButton } from "./action-button";
import { RecordPaymentDialog } from "../record-payment-dialog";
import { ApplyCreditsDialog } from "./apply-credits-dialog";

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  DRAFT: "outline",
  SENT: "secondary",
  PARTIALLY_PAID: "secondary",
  PAID: "secondary",
  OVERDUE: "destructive",
  VOID: "outline",
  WRITTEN_OFF: "outline",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const inv = await db.invoice.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: {
      contact: true,
      lineItems: true,
      payments: { include: { paymentReceived: true } },
      reminders: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!inv) notFound();

  const balance = Number(inv.total) - Number(inv.amountPaid);
  const ccy = inv.currency ?? organization.currency;

  const auditLogs = await db.auditLog.findMany({
    where: {
      organizationId: organization.id,
      entityType: "Invoice",
      entityId: inv.id,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { name: true, email: true } } },
  });

  const [openInvoicesForCustomer, bankAccounts, openCreditNotesForCustomer] = await Promise.all([
    db.invoice.findMany({
      where: {
        organizationId: organization.id,
        contactId: inv.contactId,
        deletedAt: null,
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE", "DRAFT"] },
      },
      orderBy: { dueDate: "asc" },
      select: { id: true, number: true, total: true, amountPaid: true },
    }),
    db.bankAccount.findMany({
      where: { organizationId: organization.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    db.creditNote.findMany({
      where: {
        organizationId: organization.id,
        contactId: inv.contactId,
        deletedAt: null,
        status: "OPEN",
      },
      orderBy: { date: "asc" },
      select: {
        id: true,
        number: true,
        date: true,
        total: true,
        amountApplied: true,
        amountRefunded: true,
      },
    }),
  ]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link href="/sales/invoices">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold font-mono">{inv.number}</h1>
          <Badge variant={STATUS_VARIANT[inv.status] ?? "outline"}>{inv.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {inv.status === "DRAFT" ? (
            <InvoiceActionButton
              action={markInvoiceSentAction.bind(null, inv.id)}
              label="Mark as Sent"
            />
          ) : null}
          {balance > 0.0001 &&
          inv.status !== "VOID" &&
          inv.status !== "WRITTEN_OFF" &&
          openCreditNotesForCustomer.length > 0 ? (
            <ApplyCreditsDialog
              invoiceId={inv.id}
              invoiceBalance={balance}
              currency={ccy}
              openCredits={openCreditNotesForCustomer.map((cn) => ({
                id: cn.id,
                number: cn.number,
                date: format(cn.date, "dd MMM yyyy"),
                balance:
                  Number(cn.total) -
                  Number(cn.amountApplied) -
                  Number(cn.amountRefunded),
              }))}
              action={applyCreditsToInvoiceAction}
              trigger={
                <Button size="sm" variant="outline">
                  Apply Credits
                </Button>
              }
            />
          ) : null}
          {balance > 0.0001 &&
          inv.status !== "VOID" &&
          inv.status !== "WRITTEN_OFF" ? (
            <RecordPaymentDialog
              contactId={inv.contactId}
              contactName={inv.contact.displayName}
              currentInvoiceId={inv.id}
              openInvoices={openInvoicesForCustomer.map((i) => ({
                id: i.id,
                number: i.number,
                total: Number(i.total),
                amountPaid: Number(i.amountPaid),
              }))}
              bankAccountOptions={bankAccounts.map((b) => ({
                value: b.id,
                label: b.name,
                hint: b.accountType,
              }))}
              action={recordPaymentAction}
              trigger={
                <Button size="sm" className="gap-1">
                  <DollarSign className="h-4 w-4" /> Record Payment
                </Button>
              }
            />
          ) : null}
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href={`/sales/invoices/${inv.id}/edit`}>
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/sales/invoices/${inv.id}/pdf`} target="_blank">
                  Download PDF
                </Link>
              </DropdownMenuItem>
              {inv.contact.email && inv.status !== "DRAFT" ? (
                <DropdownMenuItem asChild>
                  <form action={sendInvoiceReminderAction.bind(null, inv.id)}>
                    <button className="w-full text-left">Send Reminder</button>
                  </form>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link href={`/portal/invoices/${inv.portalAccessToken}`} target="_blank">
                  Customer portal link
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {inv.status !== "VOID" && inv.status !== "PAID" ? (
                <DropdownMenuItem asChild>
                  <form action={voidInvoiceAction.bind(null, inv.id)}>
                    <button className="w-full text-left">Mark as Void</button>
                  </form>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <DeleteButton
            action={deleteInvoiceAction.bind(null, inv.id)}
            confirmText="Delete this invoice?"
            redirectTo="/sales/invoices"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-3 text-sm md:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Customer
            </div>
            <div className="font-medium">
              <Link href={`/sales/customers/${inv.contactId}`} className="hover:underline">
                {inv.contact.displayName}
              </Link>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Invoice date
            </div>
            <div>{format(inv.issueDate, "dd MMM yyyy")}</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2">
              Due date
            </div>
            <div>{format(inv.dueDate, "dd MMM yyyy")}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Balance due
            </div>
            <div className="text-2xl font-semibold">{formatMoney(balance, ccy)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              of {formatMoney(Number(inv.total), ccy)}
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
              {inv.lineItems.map((l) => (
                <tr key={l.id}>
                  <td className="p-2">{l.description}</td>
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
          <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
            <Row label="Sub Total" value={formatMoney(Number(inv.subtotal), ccy)} />
            {Number(inv.taxTotal) !== 0 ? (
              <Row label="Tax" value={formatMoney(Number(inv.taxTotal), ccy)} />
            ) : null}
            {Number(inv.adjustmentValue) !== 0 ? (
              <Row
                label={inv.adjustmentLabel ?? "Adjustment"}
                value={formatMoney(Number(inv.adjustmentValue), ccy)}
              />
            ) : null}
            <Row label="Total" value={formatMoney(Number(inv.total), ccy)} bold />
            <Row
              label="Amount paid"
              value={formatMoney(Number(inv.amountPaid), ccy)}
            />
            <Row label="Balance due" value={formatMoney(balance, ccy)} bold />
          </div>
        </CardContent>
      </Card>

      {inv.payments.length > 0 ? (
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-sm font-semibold mb-3">Payments applied</h2>
            <ul className="space-y-1 text-sm">
              {inv.payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between border-b pb-2 last:border-b-0"
                >
                  <div>
                    <div className="font-mono">
                      <Link
                        href={`/sales/payments-received/${p.paymentReceivedId}`}
                        className="hover:underline"
                      >
                        {p.paymentReceived.number}
                      </Link>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(p.paymentReceived.paymentDate, "dd MMM yyyy")} ·{" "}
                      {p.paymentReceived.paymentMode}
                    </div>
                  </div>
                  <div className="tabular-nums">{formatMoney(Number(p.amount), ccy)}</div>
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

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${
        bold ? "border-t pt-2 font-semibold" : ""
      }`}
    >
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
