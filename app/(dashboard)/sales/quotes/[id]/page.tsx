import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/shared/delete-button";
import { ConvertButton } from "./convert";
import { deleteQuoteAction } from "../actions";
import { formatMoney } from "@/lib/money";

export default async function QuoteDetailPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrganization();
  const q = await db.quote.findFirst({
    where: { id: params.id, organizationId: organization.id },
    include: { contact: true },
  });
  if (!q) notFound();
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon"><Link href="/sales/quotes"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <h1 className="text-xl font-semibold font-mono">{q.number}</h1>
          <Badge variant={q.status === "ACCEPTED" || q.status === "INVOICED" ? "success" : "outline"}>{q.status}</Badge>
        </div>
        <div className="flex gap-2">
          <DeleteButton action={deleteQuoteAction.bind(null, q.id)} confirmText="Delete this quote?" redirectTo="/sales/quotes" />
          {q.status !== "INVOICED" && <ConvertButton quoteId={q.id} />}
        </div>
      </div>
      <Card>
        <CardContent className="pt-6 space-y-2 text-sm">
          <div className="grid gap-2 md:grid-cols-2">
            <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Customer</div><div className="font-medium">{q.contact.displayName}</div></div>
            <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Issued</div><div>{format(q.issueDate, "dd MMM yyyy")}</div></div>
            <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Expires</div><div>{q.expiryDate ? format(q.expiryDate, "dd MMM yyyy") : "—"}</div></div>
            <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Total</div><div className="text-xl font-semibold">{formatMoney(Number(q.total), organization.currency)}</div></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
