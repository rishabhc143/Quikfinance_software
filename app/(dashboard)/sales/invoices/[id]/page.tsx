import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Edit2, Wallet } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteButton } from "@/components/shared/delete-button";
import { softDeleteInvoiceAction } from "../actions";
import { formatMoney } from "@/lib/money";

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrganization();
  const inv = await db.invoice.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: { contact: true, lineItems: { include: { item: { select: { name: true } } } } },
  });
  if (!inv) notFound();
  const cur = organization.currency;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button asChild variant="ghost" size="icon"><Link href="/sales/invoices"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <h1 className="text-xl font-semibold font-mono">{inv.number}</h1>
          <Badge>{inv.status.replace("_", " ")}</Badge>
        </div>
        <div className="flex gap-2">
          <DeleteButton action={softDeleteInvoiceAction.bind(null, inv.id)} confirmText="Delete this invoice? Drafts are removed; sent invoices are voided." redirectTo="/sales/invoices" />
          {inv.status !== "PAID" && inv.status !== "DRAFT" && inv.status !== "VOID" && (
            <Button asChild variant="outline">
              <Link href={`/sales/payments-received/new?customer=${inv.contactId}&invoice=${inv.id}`}>
                <Wallet className="h-3.5 w-3.5 mr-1" /> Record payment
              </Link>
            </Button>
          )}
          <Button asChild><Link href={`/sales/invoices/${inv.id}/edit`}><Edit2 className="h-3.5 w-3.5 mr-1" /> Edit</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Customer</div><div className="font-medium mt-1">{inv.contact.displayName}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Issue / Due</div><div className="font-medium mt-1">{format(inv.issueDate, "dd MMM yyyy")} → {format(inv.dueDate, "dd MMM yyyy")}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Total / Paid</div><div className="font-medium mt-1">{formatMoney(inv.total, cur)} / {formatMoney(inv.amountPaid, cur)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Line items</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-3">Description</th><th className="text-right p-3">Qty</th><th className="text-right p-3">Rate</th><th className="text-right p-3">Amount</th></tr>
            </thead>
            <tbody className="divide-y">
              {inv.lineItems.map((l) => (
                <tr key={l.id}>
                  <td className="p-3">
                    {l.item?.name && <div className="text-xs text-muted-foreground">{l.item.name}</div>}
                    {l.description}
                  </td>
                  <td className="p-3 text-right tabular-nums">{Number(l.quantity)}</td>
                  <td className="p-3 text-right tabular-nums">{formatMoney(l.rate, cur)}</td>
                  <td className="p-3 text-right tabular-nums">{formatMoney(l.amount, cur)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/20 text-sm">
              <tr><td colSpan={3} className="p-3 text-right text-muted-foreground">Subtotal</td><td className="p-3 text-right tabular-nums">{formatMoney(inv.subtotal, cur)}</td></tr>
              <tr><td colSpan={3} className="p-3 text-right font-medium">Total</td><td className="p-3 text-right tabular-nums font-semibold">{formatMoney(inv.total, cur)}</td></tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {(inv.notes || inv.terms) && (
        <div className="grid gap-4 md:grid-cols-2">
          {inv.notes && (
            <Card><CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader><CardContent className="text-sm whitespace-pre-line">{inv.notes}</CardContent></Card>
          )}
          {inv.terms && (
            <Card><CardHeader><CardTitle className="text-base">Terms</CardTitle></CardHeader><CardContent className="text-sm whitespace-pre-line">{inv.terms}</CardContent></Card>
          )}
        </div>
      )}
    </div>
  );
}
