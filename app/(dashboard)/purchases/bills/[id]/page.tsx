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
import { softDeleteBillAction } from "../actions";
import { formatMoney } from "@/lib/money";

export default async function BillDetailPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrganization();
  const b = await db.bill.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: { contact: true, lineItems: { include: { item: { select: { name: true } } } } },
  });
  if (!b) notFound();
  const cur = organization.currency;
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button asChild variant="ghost" size="icon"><Link href="/purchases/bills"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <h1 className="text-xl font-semibold font-mono">{b.number}</h1>
          <Badge>{b.status.replace("_", " ")}</Badge>
        </div>
        <div className="flex gap-2">
          <DeleteButton action={softDeleteBillAction.bind(null, b.id)} confirmText="Delete this bill?" redirectTo="/purchases/bills" />
          {b.status !== "PAID" && b.status !== "DRAFT" && b.status !== "VOID" && (
            <Button asChild variant="outline">
              <Link href={`/purchases/payments-made/new?vendor=${b.contactId}&bill=${b.id}`}>
                <Wallet className="h-3.5 w-3.5 mr-1" /> Record payment
              </Link>
            </Button>
          )}
          <Button asChild><Link href={`/purchases/bills/${b.id}/edit`}><Edit2 className="h-3.5 w-3.5 mr-1" /> Edit</Link></Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Vendor</div><div className="font-medium mt-1">{b.contact.displayName}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Issue / Due</div><div className="font-medium mt-1">{format(b.issueDate, "dd MMM yyyy")} → {format(b.dueDate, "dd MMM yyyy")}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Total / Paid</div><div className="font-medium mt-1">{formatMoney(b.total, cur)} / {formatMoney(b.amountPaid, cur)}</div></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Line items</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-3">Description</th><th className="text-right p-3">Qty</th><th className="text-right p-3">Rate</th><th className="text-right p-3">Amount</th></tr>
            </thead>
            <tbody className="divide-y">
              {b.lineItems.map((l) => (
                <tr key={l.id}>
                  <td className="p-3">{l.item?.name && <div className="text-xs text-muted-foreground">{l.item.name}</div>}{l.description}</td>
                  <td className="p-3 text-right tabular-nums">{Number(l.quantity)}</td>
                  <td className="p-3 text-right tabular-nums">{formatMoney(l.rate, cur)}</td>
                  <td className="p-3 text-right tabular-nums">{formatMoney(l.amount, cur)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/20 text-sm">
              <tr><td colSpan={3} className="p-3 text-right font-medium">Total</td><td className="p-3 text-right tabular-nums font-semibold">{formatMoney(b.total, cur)}</td></tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
      {b.notes && (
        <Card><CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader><CardContent className="text-sm whitespace-pre-line">{b.notes}</CardContent></Card>
      )}
    </div>
  );
}
