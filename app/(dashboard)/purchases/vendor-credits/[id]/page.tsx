import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  Pencil,
  MoreHorizontal,
  CheckCircle2,
  Banknote,
  ListPlus,
  FileText,
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
} from "@/components/ui/dropdown-menu";
import { ActionFormButton } from "@/components/shared/action-form-button";
import { DeleteButton } from "@/components/shared/delete-button";
import { formatMoney } from "@/lib/money";
import {
  markVendorCreditOpenAction,
  voidVendorCreditAction,
  deleteVendorCreditAction,
  getOpenBillsForVendorCreditAction,
  applyVendorCreditToBillAction,
  recordVendorCreditRefundAction,
} from "../actions";
import { ApplyToBillDialog } from "./apply-to-bill-dialog";
import { RecordRefundDialog } from "./record-refund-dialog";

export const metadata = { title: "Vendor Credit" };

const STATUS_VARIANT: Record<
  string,
  "secondary" | "outline" | "destructive"
> = {
  DRAFT: "outline",
  OPEN: "secondary",
  CLOSED: "secondary",
  VOID: "destructive",
};

export default async function VendorCreditDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const vc = await db.vendorCredit.findFirst({
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
      lineItems: { orderBy: { position: "asc" } },
      applications: {
        include: {
          bill: { select: { id: true, number: true, issueDate: true } },
        },
        orderBy: { appliedAt: "desc" },
      },
      refunds: { orderBy: { refundDate: "desc" } },
    },
  });
  if (!vc) notFound();

  const cur = vc.currency ?? organization.currency;
  const total = Number(vc.total);
  const applied = Number(vc.amountApplied);
  const refunded = Number(vc.amountRefunded);
  const remaining = total - applied - refunded;

  const isDraft = vc.status === "DRAFT";
  const isOpen = vc.status === "OPEN";
  const isClosed = vc.status === "CLOSED";
  const isVoid = vc.status === "VOID";
  const canApply = (isOpen || isClosed) && remaining > 0.001;
  const canRefund = (isOpen || isClosed) && remaining > 0.001;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link href="/purchases/vendor-credits" className="hover:underline">
          Vendor credits
        </Link>
        <span className="mx-1">/</span>
        <span aria-current="page">{vc.number}</span>
      </nav>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link href="/purchases/vendor-credits">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight font-mono">
            {vc.number}
          </h1>
          <Badge variant={STATUS_VARIANT[vc.status] ?? "outline"}>
            {vc.status}
          </Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isDraft ? (
            <ActionFormButton
              action={markVendorCreditOpenAction.bind(null, vc.id)}
              label="Mark as Open"
              icon={<CheckCircle2 className="h-4 w-4" />}
              successToast="Vendor credit marked open"
            />
          ) : null}
          {canApply ? (
            <ApplyToBillDialog
              vendorCreditId={vc.id}
              currency={cur}
              remaining={remaining}
              loadAction={getOpenBillsForVendorCreditAction}
              applyAction={applyVendorCreditToBillAction}
              trigger={
                <Button className="gap-1">
                  <ListPlus className="h-4 w-4" /> Apply to Bill
                </Button>
              }
            />
          ) : null}
          {canRefund ? (
            <RecordRefundDialog
              vendorCreditId={vc.id}
              currency={cur}
              remaining={remaining}
              refundAction={recordVendorCreditRefundAction}
              trigger={
                <Button variant="outline" className="gap-1">
                  <Banknote className="h-4 w-4" /> Record Refund
                </Button>
              }
            />
          ) : null}
          {!isClosed && !isVoid ? (
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link href={`/purchases/vendor-credits/${vc.id}/edit`}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link
              href={`/purchases/vendor-credits/${vc.id}/pdf`}
              target="_blank"
            >
              <FileText className="h-4 w-4" /> PDF
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isVoid && applied <= 0.001 && refunded <= 0.001 ? (
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  className="p-0"
                  asChild
                >
                  <div className="px-1 py-0.5 w-full">
                    <ActionFormButton
                      action={voidVendorCreditAction.bind(null, vc.id)}
                      label="Void credit"
                      variant="ghost"
                      size="sm"
                      successToast="Vendor credit voided"
                    />
                  </div>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          {isDraft ? (
            <DeleteButton
              action={async () => {
                "use server";
                await deleteVendorCreditAction(vc.id);
              }}
              confirmText="Delete this draft vendor credit?"
              redirectTo="/purchases/vendor-credits"
            />
          ) : null}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Vendor
            </div>
            <Link
              href={`/purchases/vendors/${vc.contact.id}`}
              className="block font-medium hover:underline"
            >
              {vc.contact.displayName}
            </Link>
            {vc.contact.companyName ? (
              <div className="text-muted-foreground">
                {vc.contact.companyName}
              </div>
            ) : null}
            {vc.contact.gstin ? (
              <div className="font-mono text-xs">{vc.contact.gstin}</div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Date
            </div>
            <div>{format(vc.date, "dd MMM yyyy")}</div>
            {vc.referenceNumber ? (
              <div className="border-t pt-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Reference #
                </div>
                <div className="font-mono text-xs">{vc.referenceNumber}</div>
              </div>
            ) : null}
            {vc.subject ? (
              <div className="border-t pt-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Subject
                </div>
                <div>{vc.subject}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground text-right">
              Remaining balance
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatMoney(remaining, cur)}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              Total {formatMoney(total, cur)}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              Applied {formatMoney(applied, cur)}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              Refunded {formatMoney(refunded, cur)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Line items */}
      <Card>
        <CardContent className="pt-4">
          <h2 className="text-sm font-semibold mb-3">Line items</h2>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="text-left border-b">
                <th className="p-2">#</th>
                <th className="p-2">Item</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">Rate</th>
                <th className="p-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vc.lineItems.map((l, i) => (
                <tr key={l.id}>
                  <td className="p-2 tabular-nums">{i + 1}</td>
                  <td className="p-2">
                    <div className="font-medium">{l.name}</div>
                    {l.description ? (
                      <div className="text-xs text-muted-foreground">
                        {l.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {Number(l.quantity)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatMoney(Number(l.rate), cur)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatMoney(Number(l.amount), cur)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <tr className="border-t font-semibold">
                <td colSpan={4} className="p-2 text-right">
                  Total
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatMoney(total, cur)}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {/* Applications */}
      {vc.applications.length > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <h2 className="text-sm font-semibold mb-3">
              Applied to ({vc.applications.length})
            </h2>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="text-left">
                  <th className="p-2">Date</th>
                  <th className="p-2">Bill #</th>
                  <th className="p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {vc.applications.map((a) => (
                  <tr key={a.id}>
                    <td className="p-2">
                      {format(a.appliedAt, "dd MMM yyyy")}
                    </td>
                    <td className="p-2 font-mono">
                      <Link
                        href={`/purchases/bills/${a.bill.id}`}
                        className="hover:underline"
                      >
                        {a.bill.number}
                      </Link>
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoney(Number(a.amountApplied), cur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {/* Refunds */}
      {vc.refunds.length > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <h2 className="text-sm font-semibold mb-3">
              Refunds ({vc.refunds.length})
            </h2>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="text-left">
                  <th className="p-2">Date</th>
                  <th className="p-2">Mode</th>
                  <th className="p-2">Reference</th>
                  <th className="p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {vc.refunds.map((r) => (
                  <tr key={r.id}>
                    <td className="p-2">
                      {format(r.refundDate, "dd MMM yyyy")}
                    </td>
                    <td className="p-2">{r.paymentMode ?? "—"}</td>
                    <td className="p-2 text-xs">{r.reference ?? "—"}</td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoney(Number(r.amount), cur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {(vc.reason || vc.notes) ? (
        <div className="grid gap-4 md:grid-cols-2">
          {vc.reason ? (
            <Card>
              <CardContent className="pt-6 space-y-2 text-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Reason
                </div>
                <p>{vc.reason}</p>
              </CardContent>
            </Card>
          ) : null}
          {vc.notes ? (
            <Card>
              <CardContent className="pt-6 space-y-2 text-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Notes
                </div>
                <p className="whitespace-pre-line">{vc.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
