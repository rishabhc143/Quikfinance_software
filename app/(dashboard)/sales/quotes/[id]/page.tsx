import Link from "next/link";
import { BackLink } from "@/components/shared/dirty-form-nav";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Pencil, MoreHorizontal } from "lucide-react";
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
  deleteQuoteAction,
  markQuoteSentAction,
  markQuoteAcceptedAction,
  markQuoteDeclinedAction,
  convertQuoteToInvoiceAction,
  convertQuoteToSalesOrderAction,
  sendQuoteWithEmailAction,
} from "../actions";
import { QuoteActionButton } from "./action-button";
import { SaveAndSendDialog } from "@/components/shared/save-and-send-dialog";

export default async function QuoteDetailPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrganization();
  const q = await db.quote.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: { contact: true, lineItems: { orderBy: { position: "asc" } } },
  });
  if (!q) notFound();

  const auditLogs = await db.auditLog.findMany({
    where: {
      organizationId: organization.id,
      entityType: "Quote",
      entityId: q.id,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { name: true, email: true } } },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <BackLink href="/sales/quotes"><ArrowLeft className="h-4 w-4" /></BackLink>
          </Button>
          <h1 className="text-2xl font-semibold font-mono">{q.number}</h1>
          <Badge
            variant={
              q.status === "ACCEPTED" || q.status === "INVOICED"
                ? "secondary"
                : q.status === "DECLINED" || q.status === "EXPIRED"
                ? "destructive"
                : "outline"
            }
          >
            {q.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {q.status === "DRAFT" ? (
            <QuoteActionButton
              action={markQuoteSentAction.bind(null, q.id)}
              label="Mark as Sent"
              variant="outline"
              testId="mark-as-sent-button"
            />
          ) : null}
          {q.contact.email && q.status !== "INVOICED" ? (
            <SaveAndSendDialog
              documentId={q.id}
              documentLabel="Quote"
              toEmail={q.contact.email}
              ctx={{
                customerName: q.contact.displayName,
                customerEmail: q.contact.email,
                documentNumber: q.number,
                documentTotal: Number(q.total).toFixed(2),
                documentDate: format(q.issueDate, "dd MMM yyyy"),
                documentDueDate: q.expiryDate
                  ? format(q.expiryDate, "dd MMM yyyy")
                  : null,
                orgName: organization.name,
              }}
              action={sendQuoteWithEmailAction}
              trigger={<Button size="sm">Send</Button>}
            />
          ) : null}
          {q.status === "SENT" ? (
            <>
              <QuoteActionButton
                action={markQuoteAcceptedAction.bind(null, q.id)}
                label="Mark Accepted"
              />
              <QuoteActionButton
                action={markQuoteDeclinedAction.bind(null, q.id)}
                label="Mark Declined"
                variant="outline"
              />
            </>
          ) : null}
          {(q.status === "ACCEPTED" || q.status === "SENT") &&
          !q.convertedInvoiceId ? (
            <QuoteActionButton
              action={convertQuoteToInvoiceAction.bind(null, q.id)}
              label="Convert to Invoice"
              testId="convert-to-invoice-button"
            />
          ) : null}
          {q.convertedInvoiceId ? (
            <Button asChild variant="outline">
              <Link href={`/sales/invoices/${q.convertedInvoiceId}`}>View invoice</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href={`/sales/quotes/${q.id}/edit`}>
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
                <Link href={`/sales/quotes/${q.id}/pdf`} target="_blank">
                  Download PDF
                </Link>
              </DropdownMenuItem>
              {!q.convertedSalesOrderId ? (
                <DropdownMenuItem asChild>
                  <form action={convertQuoteToSalesOrderAction.bind(null, q.id)}>
                    <button type="submit" className="w-full text-left">
                      Convert to Sales Order
                    </button>
                  </form>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/sales/quotes/${q.id}/edit`}>Edit</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DeleteButton
            action={deleteQuoteAction.bind(null, q.id)}
            confirmText="Delete this quote?"
            redirectTo="/sales/quotes"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Customer
            </div>
            <div className="font-medium">
              <Link href={`/sales/customers/${q.contactId}`} className="hover:underline">
                {q.contact.displayName}
              </Link>
            </div>
            {q.subject ? (
              <div className="mt-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Subject
                </div>
                <div>{q.subject}</div>
              </div>
            ) : null}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Date
            </div>
            <div>{format(q.issueDate, "dd MMM yyyy")}</div>
            {q.expiryDate ? (
              <>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2">
                  Expires
                </div>
                <div>{format(q.expiryDate, "dd MMM yyyy")}</div>
              </>
            ) : null}
            {q.referenceNumber ? (
              <>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2">
                  Reference
                </div>
                <div>{q.referenceNumber}</div>
              </>
            ) : null}
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
              {q.lineItems.map((l) => (
                <tr key={l.id}>
                  <td className="p-2">
                    <div className="font-medium">{l.name}</div>
                    {l.description ? (
                      <div className="text-xs text-muted-foreground">{l.description}</div>
                    ) : null}
                  </td>
                  <td className="p-2 text-right tabular-nums">{l.quantity.toString()}</td>
                  <td className="p-2 text-right tabular-nums">
                    {formatMoney(Number(l.rate), q.currency)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatMoney(Number(l.amount), q.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
            <Row label="Sub Total" value={formatMoney(Number(q.subTotal), q.currency)} />
            {Number(q.discountValue) > 0 ? (
              <Row
                label="Discount"
                value={`-${formatMoney(Number(q.discountValue), q.currency)}`}
              />
            ) : null}
            {Number(q.taxAmount) !== 0 ? (
              <Row
                label={q.taxType ?? "Tax"}
                value={formatMoney(Number(q.taxAmount), q.currency)}
              />
            ) : null}
            {Number(q.adjustmentValue) !== 0 ? (
              <Row
                label={q.adjustmentLabel ?? "Adjustment"}
                value={formatMoney(Number(q.adjustmentValue), q.currency)}
              />
            ) : null}
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {formatMoney(Number(q.total), q.currency)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {(q.customerNotes || q.termsAndConditions) ? (
        <Card>
          <CardContent className="pt-6 space-y-3 text-sm">
            {q.customerNotes ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Notes
                </div>
                <div className="whitespace-pre-line">{q.customerNotes}</div>
              </div>
            ) : null}
            {q.termsAndConditions ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Terms &amp; Conditions
                </div>
                <div className="whitespace-pre-line">{q.termsAndConditions}</div>
              </div>
            ) : null}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
