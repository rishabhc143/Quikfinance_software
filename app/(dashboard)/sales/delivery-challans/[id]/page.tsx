import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteButton } from "@/components/shared/delete-button";
import {
  markChallanDeliveredAction,
  markChallanReturnedAction,
  deleteDeliveryChallanAction,
  convertChallanToInvoiceAction,
} from "../actions";

export default async function ChallanDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const c = await db.deliveryChallan.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: { contact: true, lineItems: { orderBy: { position: "asc" } } },
  });
  if (!c) notFound();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link href="/sales/delivery-challans">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold font-mono">{c.number}</h1>
          <Badge variant="outline">{c.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {c.status !== "DELIVERED" ? (
                <DropdownMenuItem asChild>
                  <form action={markChallanDeliveredAction.bind(null, c.id)}>
                    <button type="submit" className="w-full text-left">Mark as Delivered</button>
                  </form>
                </DropdownMenuItem>
              ) : null}
              {c.status !== "RETURNED" ? (
                <DropdownMenuItem asChild>
                  <form action={markChallanReturnedAction.bind(null, c.id)}>
                    <button type="submit" className="w-full text-left">Mark as Returned</button>
                  </form>
                </DropdownMenuItem>
              ) : null}
              {c.status !== "INVOICED" && c.contactId ? (
                <DropdownMenuItem asChild>
                  <form action={convertChallanToInvoiceAction.bind(null, c.id)}>
                    <button type="submit" className="w-full text-left">Convert to Invoice</button>
                  </form>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <DeleteButton
            action={deleteDeliveryChallanAction.bind(null, c.id)}
            confirmText="Delete this delivery challan?"
            redirectTo="/sales/delivery-challans"
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
              {c.contact ? (
                <Link href={`/sales/customers/${c.contactId}`} className="hover:underline">
                  {c.contact.displayName}
                </Link>
              ) : (
                "—"
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Date
            </div>
            <div>{format(c.date, "dd MMM yyyy")}</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2">
              Challan type
            </div>
            <div>{c.challanType}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Item</th>
                <th className="p-2 text-left">HSN/SAC</th>
                <th className="p-2 text-right">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {c.lineItems.map((l) => (
                <tr key={l.id}>
                  <td className="p-2">
                    <div className="font-medium">{l.name}</div>
                    {l.description ? (
                      <div className="text-xs text-muted-foreground">{l.description}</div>
                    ) : null}
                  </td>
                  <td className="p-2">{l.hsnSacCode ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">
                    {l.quantity.toString()} {l.unit ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
