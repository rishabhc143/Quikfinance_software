import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteButton } from "@/components/shared/delete-button";
import { formatMoney } from "@/lib/money";
import {
  deletePaymentReceivedAction,
  refundPaymentAction,
  emailPaymentReceiptAction,
} from "../actions";
import { RefundPaymentDialog } from "./refund-dialog";

export default async function PaymentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const p = await db.paymentReceived.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: {
      contact: true,
      allocations: { include: { invoice: true } },
    },
  });
  if (!p) notFound();

  const ccy = organization.currency;
  const totalAllocated = Number(p.amountUsedForInvoices);
  const unused = Number(p.amount) - totalAllocated;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link href="/sales/payments-received">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold font-mono">{p.number}</h1>
        </div>
        <div className="flex items-center gap-2">
          {p.contact.email ? (
            <form action={emailPaymentReceiptAction.bind(null, p.id)}>
              <Button type="submit" variant="outline" size="sm">
                Email Receipt
              </Button>
            </form>
          ) : null}
          <RefundPaymentDialog
            paymentId={p.id}
            number={p.number}
            amount={Number(p.amount)}
            currency={ccy}
            paymentMode={p.paymentMode}
            action={refundPaymentAction}
            trigger={
              <Button variant="outline" size="sm">
                {p.paymentMode === "razorpay" ? "Refund via Razorpay" : "Refund"}
              </Button>
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a href={`/sales/customers/${p.contactId}`}>View customer</a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DeleteButton
            action={deletePaymentReceivedAction.bind(null, p.id)}
            confirmText="Delete this payment? Allocated payments cannot be deleted."
            redirectTo="/sales/payments-received"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer</span>
              <Link href={`/sales/customers/${p.contactId}`} className="hover:underline font-medium">
                {p.contact.displayName}
              </Link>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment date</span>
              <span>{format(p.paymentDate, "dd MMM yyyy")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mode</span>
              <span>{p.paymentMode}</span>
            </div>
            {p.reference ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reference</span>
                <span>{p.reference}</span>
              </div>
            ) : null}
            {p.notes ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Notes
                </div>
                <p>{p.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount received</span>
              <span className="text-lg font-semibold">
                {formatMoney(Number(p.amount), ccy)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Allocated to invoices</span>
              <span>{formatMoney(totalAllocated, ccy)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unused (customer credit)</span>
              <span>{formatMoney(unused, ccy)}</span>
            </div>
            {Number(p.bankCharges) > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bank charges</span>
                <span>{formatMoney(Number(p.bankCharges), ccy)}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <h2 className="text-sm font-semibold mb-3">Applied to invoices</h2>
          {p.allocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No allocations.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="text-left">
                  <th className="p-2">Invoice</th>
                  <th className="p-2">Date</th>
                  <th className="p-2 text-right">Applied</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {p.allocations.map((a) => (
                  <tr key={a.id}>
                    <td className="p-2 font-mono">
                      <Link href={`/sales/invoices/${a.invoiceId}`} className="hover:underline">
                        {a.invoice.number}
                      </Link>
                    </td>
                    <td className="p-2">{format(a.invoice.issueDate, "dd MMM yyyy")}</td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoney(Number(a.amount), ccy)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
