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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteButton } from "@/components/shared/delete-button";
import { formatMoney } from "@/lib/money";
import {
  deleteSalesOrderAction,
  confirmSalesOrderAction,
  closeSalesOrderAction,
  convertSalesOrderToInvoiceAction,
  convertSalesOrderToPurchaseOrderAction,
} from "../actions";
import { SalesOrderActionButton } from "./action-button";

export default async function SalesOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const so = await db.salesOrder.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: { contact: true, lineItems: { orderBy: { position: "asc" } } },
  });
  if (!so) notFound();

  const auditLogs = await db.auditLog.findMany({
    where: {
      organizationId: organization.id,
      entityType: "SalesOrder",
      entityId: so.id,
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
            <BackLink href="/sales/orders"><ArrowLeft className="h-4 w-4" /></BackLink>
          </Button>
          <h1 className="text-2xl font-semibold font-mono">{so.number}</h1>
          <Badge variant={so.status === "VOID" ? "destructive" : "secondary"}>
            {so.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {so.status === "DRAFT" ? (
            <SalesOrderActionButton
              action={confirmSalesOrderAction.bind(null, so.id)}
              label="Mark Confirmed"
            />
          ) : null}
          {so.status === "CONFIRMED" && !so.convertedInvoiceId ? (
            <SalesOrderActionButton
              action={convertSalesOrderToInvoiceAction.bind(null, so.id)}
              label="Convert to Invoice"
            />
          ) : null}
          {so.convertedInvoiceId ? (
            <Button asChild variant="outline">
              <Link href={`/sales/invoices/${so.convertedInvoiceId}`}>View invoice</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href={`/sales/orders/${so.id}/edit`}>
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
                <Link href={`/sales/orders/${so.id}/pdf`} target="_blank">
                  Download PDF
                </Link>
              </DropdownMenuItem>
              {so.status === "CONFIRMED" ? (
                <DropdownMenuItem asChild>
                  <form action={closeSalesOrderAction.bind(null, so.id)}>
                    <button type="submit" className="w-full text-left">Mark as Closed</button>
                  </form>
                </DropdownMenuItem>
              ) : null}
              {!so.convertedPurchaseOrderId ? (
                <DropdownMenuItem asChild>
                  <form
                    action={convertSalesOrderToPurchaseOrderAction.bind(null, so.id)}
                  >
                    <button type="submit" className="w-full text-left">Convert to Purchase Order</button>
                  </form>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <DeleteButton
            action={deleteSalesOrderAction.bind(null, so.id)}
            confirmText="Delete this sales order?"
            redirectTo="/sales/orders"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Customer</div>
            <div className="font-medium">
              <Link href={`/sales/customers/${so.contactId}`} className="hover:underline">
                {so.contact.displayName}
              </Link>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Order date</div>
            <div>{format(so.orderDate, "dd MMM yyyy")}</div>
            {so.expectedShipmentDate ? (
              <>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2">
                  Expected shipment
                </div>
                <div>{format(so.expectedShipmentDate, "dd MMM yyyy")}</div>
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
              {so.lineItems.map((l) => (
                <tr key={l.id}>
                  <td className="p-2">
                    <div className="font-medium">{l.name}</div>
                    {l.description ? (
                      <div className="text-xs text-muted-foreground">{l.description}</div>
                    ) : null}
                  </td>
                  <td className="p-2 text-right tabular-nums">{l.quantity.toString()}</td>
                  <td className="p-2 text-right tabular-nums">
                    {formatMoney(Number(l.rate), so.currency)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatMoney(Number(l.amount), so.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
            <Row label="Sub Total" value={formatMoney(Number(so.subTotal), so.currency)} />
            {Number(so.discountValue) > 0 ? (
              <Row
                label="Discount"
                value={`-${formatMoney(Number(so.discountValue), so.currency)}`}
              />
            ) : null}
            {Number(so.taxAmount) !== 0 ? (
              <Row label={so.taxType ?? "Tax"} value={formatMoney(Number(so.taxAmount), so.currency)} />
            ) : null}
            {Number(so.adjustmentValue) !== 0 ? (
              <Row
                label={so.adjustmentLabel ?? "Adjustment"}
                value={formatMoney(Number(so.adjustmentValue), so.currency)}
              />
            ) : null}
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {formatMoney(Number(so.total), so.currency)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

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
