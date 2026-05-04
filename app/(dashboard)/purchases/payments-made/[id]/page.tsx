import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/shared/delete-button";
import { deletePaymentMadeAction } from "../actions";
import { formatMoney } from "@/lib/money";

export default async function PaymentMadeDetailPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrganization();
  const p = await db.paymentMade.findFirst({
    where: { id: params.id, organizationId: organization.id },
    include: { contact: true, allocations: { include: { bill: { select: { number: true } } } } },
  });
  if (!p) notFound();
  const cur = organization.currency;
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon"><Link href="/purchases/payments-made"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <h1 className="text-xl font-semibold font-mono">{p.number}</h1>
          <Badge variant="success">Paid</Badge>
        </div>
        <DeleteButton action={deletePaymentMadeAction.bind(null, p.id)} confirmText="Delete this payment? Allocations will be reversed." redirectTo="/purchases/payments-made" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Vendor</div><div className="font-medium mt-1">{p.contact.displayName}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Date / Method</div><div className="font-medium mt-1">{format(p.paymentDate, "dd MMM yyyy")} · {p.method ?? "—"}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Amount</div><div className="text-2xl font-semibold mt-1 tabular-nums">{formatMoney(Number(p.amount), cur)}</div></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Applied to bills</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">Bill</th><th className="text-right p-3">Amount applied</th></tr></thead>
            <tbody className="divide-y">
              {p.allocations.map((a) => (
                <tr key={a.id}>
                  <td className="p-3 font-mono">{a.bill.number}</td>
                  <td className="p-3 text-right tabular-nums">{formatMoney(Number(a.amount), cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
