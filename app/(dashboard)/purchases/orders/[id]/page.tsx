import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  Pencil,
  Send,
  Printer,
  CheckCircle2,
  FileText,
  ArrowRightCircle,
  MoreHorizontal,
} from "lucide-react";
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
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DeleteButton } from "@/components/shared/delete-button";
import { ActionFormButton } from "@/components/shared/action-form-button";
import { formatMoney } from "@/lib/money";
import {
  markPurchaseOrderIssuedAction,
  closePurchaseOrderAction,
  cancelPurchaseOrderAction,
  clonePurchaseOrderAction,
  convertPurchaseOrderToBillAction,
  deletePurchaseOrderAction,
} from "../actions";

export const metadata = { title: "Purchase Order" };

const STATUS_VARIANT: Record<
  string,
  "secondary" | "outline" | "destructive"
> = {
  DRAFT: "outline",
  ISSUED: "secondary",
  PARTIALLY_BILLED: "secondary",
  BILLED: "secondary",
  CLOSED: "secondary",
  CANCELLED: "destructive",
};

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();

  const po = await db.purchaseOrder.findFirst({
    where: {
      id: params.id,
      organizationId: organization.id,
      deletedAt: null,
    },
    include: {
      contact: {
        select: {
          id: true,
          displayName: true,
          email: true,
          companyName: true,
          gstin: true,
        },
      },
      lineItems: {
        orderBy: { position: "asc" },
        include: {
          item: { select: { name: true, sku: true } },
          // No relation on accountId — we resolve account names below.
        },
      },
      attachments: true,
      bills: {
        where: { deletedAt: null },
        orderBy: { issueDate: "desc" },
        select: {
          id: true,
          number: true,
          status: true,
          issueDate: true,
          total: true,
        },
      },
    },
  });

  if (!po) notFound();

  // Resolve GL account names for the inline ACCOUNT column.
  const accountIds = Array.from(
    new Set(po.lineItems.map((l) => l.accountId).filter(Boolean) as string[])
  );
  const accounts = accountIds.length
    ? await db.chartOfAccount.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, name: true, code: true },
      })
    : [];
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const isDraft = po.status === "DRAFT";
  const isIssued = po.status === "ISSUED";
  const isPartiallyBilled = po.status === "PARTIALLY_BILLED";
  const isBilled = po.status === "BILLED";
  const isClosed = po.status === "CLOSED";
  const isCancelled = po.status === "CANCELLED";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link href="/purchases/orders" className="hover:underline">
          Purchase orders
        </Link>
        <span className="mx-1">/</span>
        <span aria-current="page">{po.number}</span>
      </nav>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link href="/purchases/orders">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight font-mono">
            {po.number}
          </h1>
          <Badge variant={STATUS_VARIANT[po.status] ?? "outline"}>
            {po.status.replaceAll("_", " ")}
          </Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Primary action varies by status. */}
          {isDraft ? (
            <ActionFormButton
              action={markPurchaseOrderIssuedAction.bind(null, po.id)}
              label="Mark as Issued"
              icon={<CheckCircle2 className="h-4 w-4" />}
              successToast="Marked as Issued"
              testId="mark-po-issued-button"
            />
          ) : null}
          {(isIssued || isPartiallyBilled) ? (
            <ActionFormButton
              action={convertPurchaseOrderToBillAction.bind(null, po.id)}
              label={
                isPartiallyBilled
                  ? "Convert to Bill (remaining)"
                  : "Convert to Bill"
              }
              icon={<ArrowRightCircle className="h-4 w-4" />}
              variant="default"
              redirects
              testId="convert-po-to-bill-button"
            />
          ) : null}

          {/* Edit allowed in editable states. */}
          {!isClosed && !isCancelled ? (
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link href={`/purchases/orders/${po.id}/edit`}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
          ) : null}

          {/* PDF + Send (P3-D wires the real handlers). */}
          {(isIssued || isPartiallyBilled || isBilled || isClosed) ? (
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link href={`/purchases/orders/${po.id}/pdf`} target="_blank">
                <FileText className="h-4 w-4" /> PDF
              </Link>
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/purchases/orders/${po.id}/edit`}>Edit</Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="p-0"
                asChild
              >
                <div className="px-1 py-0.5 w-full">
                  <ActionFormButton
                    action={clonePurchaseOrderAction.bind(null, po.id)}
                    label="Clone"
                    variant="ghost"
                    size="sm"
                    redirects
                  />
                </div>
              </DropdownMenuItem>
              {(isIssued || isPartiallyBilled || isBilled) ? (
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  className="p-0"
                  asChild
                >
                  <div className="px-1 py-0.5 w-full">
                    <ActionFormButton
                      action={closePurchaseOrderAction.bind(null, po.id)}
                      label="Mark as Closed"
                      variant="ghost"
                      size="sm"
                      successToast="Purchase order closed"
                    />
                  </div>
                </DropdownMenuItem>
              ) : null}
              {!isCancelled ? (
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  className="p-0"
                  asChild
                >
                  <div className="px-1 py-0.5 w-full">
                    <ActionFormButton
                      action={cancelPurchaseOrderAction.bind(null, po.id)}
                      label="Cancel PO"
                      variant="ghost"
                      size="sm"
                      successToast="Purchase order cancelled"
                    />
                  </div>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/purchases/orders/${po.id}/pdf`} target="_blank">
                  <Printer className="h-4 w-4 mr-2" /> Print / PDF
                </Link>
              </DropdownMenuItem>
              {(isIssued || isPartiallyBilled) ? (
                <DropdownMenuItem asChild>
                  <Link href={`/purchases/orders/${po.id}/send`}>
                    <Send className="h-4 w-4 mr-2" /> Send to vendor
                  </Link>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          {isDraft ? (
            <DeleteButton
              action={deletePurchaseOrderAction.bind(null, po.id)}
              confirmText="Delete this draft PO? This action is reversible."
              redirectTo="/purchases/orders"
            />
          ) : null}
        </div>
      </div>

      {/* ───── Summary grid ───── */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Vendor
            </div>
            <Link
              href={`/purchases/vendors/${po.contact.id}`}
              className="block font-medium hover:underline"
            >
              {po.contact.displayName}
            </Link>
            {po.contact.companyName ? (
              <div className="text-muted-foreground">
                {po.contact.companyName}
              </div>
            ) : null}
            {po.contact.email ? (
              <div className="text-muted-foreground break-all">
                {po.contact.email}
              </div>
            ) : null}
            {po.contact.gstin ? (
              <div className="font-mono text-xs">{po.contact.gstin}</div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Order date
              </div>
              <div>{format(po.orderDate, "dd MMM yyyy")}</div>
            </div>
            {po.deliveryDate ? (
              <div className="border-t pt-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Expected delivery
                </div>
                <div>{format(po.deliveryDate, "dd MMM yyyy")}</div>
              </div>
            ) : null}
            {po.referenceNumber ? (
              <div className="border-t pt-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Reference #
                </div>
                <div className="font-mono text-xs">{po.referenceNumber}</div>
              </div>
            ) : null}
            {po.placeOfSupply ? (
              <div className="border-t pt-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Place of supply
                </div>
                <div>{po.placeOfSupply}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-2 text-sm text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground text-right">
              Total
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatMoney(
                Number(po.total),
                po.currency ?? organization.currency
              )}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              Subtotal{" "}
              {formatMoney(
                Number(po.subTotal),
                po.currency ?? organization.currency
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ───── Line items ───── */}
      <Card>
        <CardContent className="pt-4">
          <h2 className="text-sm font-semibold mb-3">Line items</h2>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="text-left border-b">
                <th className="p-2">#</th>
                <th className="p-2">Item</th>
                <th className="p-2">Account</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">Rate</th>
                <th className="p-2 text-right">Discount</th>
                <th className="p-2 text-right">Tax</th>
                <th className="p-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {po.lineItems.map((l, i) => {
                const acct = l.accountId ? accountById.get(l.accountId) : null;
                return (
                  <tr key={l.id}>
                    <td className="p-2 tabular-nums">{i + 1}</td>
                    <td className="p-2">
                      <div className="font-medium">{l.name}</div>
                      {l.item?.sku ? (
                        <div className="text-xs font-mono text-muted-foreground">
                          {l.item.sku}
                        </div>
                      ) : null}
                      {l.description ? (
                        <div className="text-xs text-muted-foreground">
                          {l.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-2 text-xs">
                      {acct ? (
                        <>
                          {acct.code ? (
                            <span className="font-mono">
                              {acct.code}{" "}
                            </span>
                          ) : null}
                          {acct.name}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {Number(l.quantity)}
                      {l.unit ? (
                        <span className="text-xs text-muted-foreground ml-1">
                          {l.unit}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoney(
                        Number(l.rate),
                        po.currency ?? organization.currency
                      )}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {Number(l.discount) > 0
                        ? `${Number(l.discount)}${
                            l.discountType === "percentage" ? "%" : ""
                          }`
                        : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {Number(l.taxAmount) > 0
                        ? formatMoney(
                            Number(l.taxAmount),
                            po.currency ?? organization.currency
                          )
                        : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums font-medium">
                      {formatMoney(
                        Number(l.amount),
                        po.currency ?? organization.currency
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="text-sm">
              <tr className="border-t">
                <td colSpan={7} className="p-2 text-right">
                  Subtotal
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatMoney(
                    Number(po.subTotal),
                    po.currency ?? organization.currency
                  )}
                </td>
              </tr>
              {Number(po.discountValue) > 0 ? (
                <tr>
                  <td colSpan={7} className="p-2 text-right">
                    Document discount
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    −{Number(po.discountValue)}
                    {po.discountType === "percentage" ? "%" : ""}
                  </td>
                </tr>
              ) : null}
              {Number(po.taxAmount) !== 0 ? (
                <tr>
                  <td colSpan={7} className="p-2 text-right">
                    {po.taxType ?? "Tax"}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatMoney(
                      Number(po.taxAmount),
                      po.currency ?? organization.currency
                    )}
                  </td>
                </tr>
              ) : null}
              {Number(po.adjustmentValue) !== 0 ? (
                <tr>
                  <td colSpan={7} className="p-2 text-right">
                    {po.adjustmentLabel ?? "Adjustment"}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatMoney(
                      Number(po.adjustmentValue),
                      po.currency ?? organization.currency
                    )}
                  </td>
                </tr>
              ) : null}
              <tr className="border-t font-semibold">
                <td colSpan={7} className="p-2 text-right">
                  Total
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatMoney(
                    Number(po.total),
                    po.currency ?? organization.currency
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {/* ───── Notes / T&C ───── */}
      {(po.notes || po.termsAndConditions) ? (
        <div className="grid gap-4 md:grid-cols-2">
          {po.notes ? (
            <Card>
              <CardContent className="pt-6 space-y-2 text-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Notes
                </div>
                <p className="whitespace-pre-line">{po.notes}</p>
              </CardContent>
            </Card>
          ) : null}
          {po.termsAndConditions ? (
            <Card>
              <CardContent className="pt-6 space-y-2 text-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Terms &amp; conditions
                </div>
                <p className="whitespace-pre-line">{po.termsAndConditions}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ───── Linked bills ───── */}
      {po.bills.length > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <h2 className="text-sm font-semibold mb-3">
              Linked bills ({po.bills.length})
            </h2>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="text-left">
                  <th className="p-2">Date</th>
                  <th className="p-2">Bill #</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {po.bills.map((b) => (
                  <tr key={b.id}>
                    <td className="p-2">
                      {format(b.issueDate, "dd MMM yyyy")}
                    </td>
                    <td className="p-2 font-mono">
                      <Link
                        href={`/purchases/bills/${b.id}`}
                        className="hover:underline"
                      >
                        {b.number}
                      </Link>
                    </td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-xs">
                        {b.status}
                      </Badge>
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoney(
                        Number(b.total),
                        po.currency ?? organization.currency
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {/* ───── Status timestamps strip ───── */}
      <div className="text-xs text-muted-foreground space-x-3">
        {po.sentAt ? (
          <span>
            Sent {format(po.sentAt, "dd MMM yyyy, HH:mm")}
          </span>
        ) : null}
        {po.closedAt ? (
          <span>
            Closed {format(po.closedAt, "dd MMM yyyy, HH:mm")}
          </span>
        ) : null}
        {po.cancelledAt ? (
          <span>
            Cancelled {format(po.cancelledAt, "dd MMM yyyy, HH:mm")}
          </span>
        ) : null}
      </div>

    </div>
  );
}
