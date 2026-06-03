import Link from "next/link";
import { BackLink } from "@/components/shared/dirty-form-nav";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  Pencil,
  MoreHorizontal,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  FileText,
  CreditCard,
  Repeat,
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
import { ApplyCreditsDialog } from "./apply-credits-dialog";
import {
  markBillOpenAction,
  voidBillAction,
  writeOffBillAction,
  cloneBillAction,
  softDeleteBillAction,
  getOpenCreditsForBillAction,
  applyCreditsToBillAction,
} from "../actions";

export const metadata = { title: "Bill" };

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  DRAFT: "outline",
  OPEN: "secondary",
  PARTIALLY_PAID: "secondary",
  PAID: "secondary",
  OVERDUE: "destructive",
  VOID: "destructive",
  WRITTEN_OFF: "outline",
};

export default async function BillDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();

  const b = await db.bill.findFirst({
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
          msmeRegistered: true,
        },
      },
      lineItems: {
        orderBy: { position: "asc" },
        include: {
          item: { select: { name: true, sku: true } },
        },
      },
      attachments: true,
      payments: {
        include: {
          paymentMade: {
            select: {
              id: true,
              number: true,
              paymentDate: true,
              paymentMode: true,
            },
          },
        },
        orderBy: { id: "desc" },
      },
      creditApplications: {
        include: {
          vendorCredit: {
            select: { id: true, number: true, date: true },
          },
        },
        orderBy: { id: "desc" },
      },
      purchaseOrder: {
        select: { id: true, number: true, status: true },
      },
    },
  });

  if (!b) notFound();

  // Resolve account names for the inline ACCOUNT column.
  const accountIds = Array.from(
    new Set(
      b.lineItems
        .map((l) => l.accountId)
        .filter((id): id is string => !!id)
    )
  );
  const accounts = accountIds.length
    ? await db.chartOfAccount.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, name: true, code: true },
      })
    : [];
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  // Resolve customer names for the BILLABLE TO column.
  const customerIds = Array.from(
    new Set(
      b.lineItems
        .map((l) => l.billableToCustomerId)
        .filter((id): id is string => !!id)
    )
  );
  const customers = customerIds.length
    ? await db.contact.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const customerById = new Map(customers.map((c) => [c.id, c]));

  const cur = b.currency ?? organization.currency;
  const balanceDue = Number(b.total) - Number(b.amountPaid);
  const isOverdue =
    b.status === "OPEN" &&
    balanceDue > 0 &&
    b.dueDate.getTime() < Date.now();
  const displayStatus = isOverdue ? "OVERDUE" : b.status;

  const isDraft = b.status === "DRAFT";
  const isOpen = b.status === "OPEN" || b.status === "PARTIALLY_PAID";
  const isPaid = b.status === "PAID";
  const isVoid = b.status === "VOID";
  const isWrittenOff = b.status === "WRITTEN_OFF";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link href="/purchases/bills" className="hover:underline">
          Bills
        </Link>
        <span className="mx-1">/</span>
        <span aria-current="page">{b.number}</span>
      </nav>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <BackLink href="/purchases/bills"><ArrowLeft className="h-4 w-4" /></BackLink>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight font-mono">
            {b.number}
          </h1>
          <Badge variant={STATUS_VARIANT[displayStatus] ?? "outline"}>
            {displayStatus.replaceAll("_", " ")}
          </Badge>
          {b.purchaseOrder ? (
            <Link
              href={`/purchases/orders/${b.purchaseOrder.id}`}
              className="text-xs text-muted-foreground hover:underline"
            >
              from PO{" "}
              <span className="font-mono">{b.purchaseOrder.number}</span>
            </Link>
          ) : null}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isDraft ? (
            <ActionFormButton
              action={markBillOpenAction.bind(null, b.id)}
              label="Mark as Open"
              icon={<CheckCircle2 className="h-4 w-4" />}
              successToast="Bill marked open"
              testId="mark-bill-open-button"
            />
          ) : null}
          {(isOpen || isOverdue) && balanceDue > 0 ? (
            <Button asChild className="gap-1" data-testid="record-payment-link">
              <Link
                href={`/purchases/payments-made/new?vendor=${b.contactId}&bill=${b.id}`}
              >
                <Wallet className="h-4 w-4" /> Record payment
              </Link>
            </Button>
          ) : null}

          {!isPaid && !isVoid && !isWrittenOff ? (
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link href={`/purchases/bills/${b.id}/edit`}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
          ) : null}

          {/* Apply Credits — only when there's outstanding balance + bill is in an applicable state. */}
          {(isOpen || isOverdue) && balanceDue > 0 ? (
            <ApplyCreditsDialog
              billId={b.id}
              outstanding={balanceDue}
              currency={cur}
              loadAction={getOpenCreditsForBillAction}
              applyAction={applyCreditsToBillAction}
              trigger={
                <Button variant="outline" size="sm" className="gap-1">
                  <CreditCard className="h-4 w-4" /> Apply Credits
                </Button>
              }
            />
          ) : null}

          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href={`/purchases/bills/${b.id}/pdf`} target="_blank">
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
              {!isPaid && !isVoid && !isWrittenOff ? (
                <DropdownMenuItem asChild>
                  <Link href={`/purchases/bills/${b.id}/edit`}>Edit</Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className="p-0"
                asChild
              >
                <div className="px-1 py-0.5 w-full">
                  <ActionFormButton
                    action={cloneBillAction.bind(null, b.id)}
                    label="Clone"
                    variant="ghost"
                    size="sm"
                    redirects
                  />
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={`/purchases/recurring-bills/new?fromBillId=${b.id}`}
                >
                  <Repeat className="h-4 w-4 mr-2" /> Convert to Recurring
                </Link>
              </DropdownMenuItem>
              {!isVoid && !isPaid && !isWrittenOff ? (
                <DropdownMenuItem
                  className="p-0"
                  asChild
                >
                  <div className="px-1 py-0.5 w-full">
                    <ActionFormButton
                      action={voidBillAction.bind(null, b.id)}
                      label="Void bill"
                      variant="ghost"
                      size="sm"
                      successToast="Bill voided"
                    />
                  </div>
                </DropdownMenuItem>
              ) : null}
              {(isOpen || isOverdue) && balanceDue > 0 ? (
                <DropdownMenuItem
                  className="p-0"
                  asChild
                >
                  <div className="px-1 py-0.5 w-full">
                    <ActionFormButton
                      action={writeOffBillAction.bind(null, b.id)}
                      label="Write off"
                      variant="ghost"
                      size="sm"
                      successToast="Bill written off"
                    />
                  </div>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link
                  href={`/purchases/payments-made/new?vendor=${b.contactId}&bill=${b.id}`}
                >
                  <Wallet className="h-4 w-4 mr-2" /> Record payment
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {isDraft ? (
            <DeleteButton
              action={softDeleteBillAction.bind(null, b.id)}
              confirmText="Delete this draft bill? This action is reversible."
              redirectTo="/purchases/bills"
            />
          ) : null}
        </div>
      </div>

      {/* Overdue warning band */}
      {isOverdue ? (
        <div className="rounded-md border-l-4 border-red-400 bg-red-50 dark:bg-red-950/30 p-3 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <span>
            This bill is <strong>overdue</strong> — due {format(b.dueDate, "dd MMM yyyy")}.
            {b.contact.msmeRegistered
              ? " MSME vendor — interest at 3× bank rate applies under MSMED Act."
              : ""}
          </span>
        </div>
      ) : null}

      {/* ───── Summary grid ───── */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Vendor
            </div>
            <Link
              href={`/purchases/vendors/${b.contact.id}`}
              className="block font-medium hover:underline"
            >
              {b.contact.displayName}
            </Link>
            {b.contact.companyName ? (
              <div className="text-muted-foreground">
                {b.contact.companyName}
              </div>
            ) : null}
            {b.contact.email ? (
              <div className="text-muted-foreground break-all">
                {b.contact.email}
              </div>
            ) : null}
            {b.contact.gstin ? (
              <div className="font-mono text-xs">{b.contact.gstin}</div>
            ) : null}
            {b.contact.msmeRegistered ? (
              <Badge variant="secondary" className="text-xs">
                MSME
              </Badge>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Bill date
              </div>
              <div>{format(b.issueDate, "dd MMM yyyy")}</div>
            </div>
            <div className="border-t pt-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Due date
              </div>
              <div>{format(b.dueDate, "dd MMM yyyy")}</div>
            </div>
            {b.referenceNumber ? (
              <div className="border-t pt-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Order # / Reference
                </div>
                <div className="font-mono text-xs">{b.referenceNumber}</div>
              </div>
            ) : null}
            {b.placeOfSupply ? (
              <div className="border-t pt-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Place of supply
                </div>
                <div>{b.placeOfSupply}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-2 text-sm text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground text-right">
              Balance due
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatMoney(balanceDue, cur)}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              Total {formatMoney(Number(b.total), cur)}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              Paid {formatMoney(Number(b.amountPaid), cur)}
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
                <th className="p-2">Billable to</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">Rate</th>
                <th className="p-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {b.lineItems.map((l, i) => {
                const acct = l.accountId
                  ? accountById.get(l.accountId)
                  : null;
                const cust = l.billableToCustomerId
                  ? customerById.get(l.billableToCustomerId)
                  : null;
                return (
                  <tr key={l.id}>
                    <td className="p-2 tabular-nums">{i + 1}</td>
                    <td className="p-2">
                      <div className="font-medium">{l.name || l.description}</div>
                      {l.item?.sku ? (
                        <div className="text-xs font-mono text-muted-foreground">
                          {l.item.sku}
                        </div>
                      ) : null}
                      {l.description && l.description !== l.name ? (
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
                    <td className="p-2 text-xs">
                      {cust ? (
                        <>
                          <Link
                            href={`/sales/customers/${cust.id}`}
                            className="hover:underline"
                          >
                            {cust.displayName}
                          </Link>
                          {l.billableUsedAt ? (
                            <span className="ml-1 text-emerald-700 dark:text-emerald-400">
                              ✓ billed
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {Number(l.quantity)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoney(Number(l.rate), cur)}
                    </td>
                    <td className="p-2 text-right tabular-nums font-medium">
                      {formatMoney(Number(l.amount), cur)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="text-sm">
              <tr className="border-t">
                <td colSpan={6} className="p-2 text-right">
                  Subtotal
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatMoney(Number(b.subtotal), cur)}
                </td>
              </tr>
              {Number(b.discountValue) > 0 ? (
                <tr>
                  <td colSpan={6} className="p-2 text-right">
                    Document discount
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    −{Number(b.discountValue)}
                    {b.discountType === "percentage" ? "%" : ""}
                  </td>
                </tr>
              ) : null}
              {Number(b.taxTotal) !== 0 ? (
                <tr>
                  <td colSpan={6} className="p-2 text-right">
                    Tax
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatMoney(Number(b.taxTotal), cur)}
                  </td>
                </tr>
              ) : null}
              {Number(b.adjustmentValue) !== 0 ? (
                <tr>
                  <td colSpan={6} className="p-2 text-right">
                    {b.adjustmentLabel ?? "Adjustment"}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatMoney(Number(b.adjustmentValue), cur)}
                  </td>
                </tr>
              ) : null}
              <tr className="border-t font-semibold">
                <td colSpan={6} className="p-2 text-right">
                  Total
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatMoney(Number(b.total), cur)}
                </td>
              </tr>
              <tr>
                <td colSpan={6} className="p-2 text-right text-muted-foreground">
                  Paid
                </td>
                <td className="p-2 text-right tabular-nums">
                  −{formatMoney(Number(b.amountPaid), cur)}
                </td>
              </tr>
              <tr className="border-t font-semibold">
                <td colSpan={6} className="p-2 text-right">
                  Balance due
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatMoney(balanceDue, cur)}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {/* ───── Payments applied ───── */}
      {b.payments.length > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <h2 className="text-sm font-semibold mb-3">
              Payments applied ({b.payments.length})
            </h2>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="text-left">
                  <th className="p-2">Date</th>
                  <th className="p-2">Payment #</th>
                  <th className="p-2">Mode</th>
                  <th className="p-2 text-right">Amount applied</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {b.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="p-2">
                      {format(p.paymentMade.paymentDate, "dd MMM yyyy")}
                    </td>
                    <td className="p-2 font-mono">
                      <Link
                        href={`/purchases/payments-made/${p.paymentMade.id}`}
                        className="hover:underline"
                      >
                        {p.paymentMade.number}
                      </Link>
                    </td>
                    <td className="p-2">{p.paymentMade.paymentMode ?? "—"}</td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoney(Number(p.amount), cur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {/* ───── Credits applied ───── */}
      {b.creditApplications.length > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <h2 className="text-sm font-semibold mb-3">
              Vendor credits applied ({b.creditApplications.length})
            </h2>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="text-left">
                  <th className="p-2">Date</th>
                  <th className="p-2">Credit Note #</th>
                  <th className="p-2 text-right">Amount applied</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {b.creditApplications.map((c) => (
                  <tr key={c.id}>
                    <td className="p-2">
                      {format(c.vendorCredit.date, "dd MMM yyyy")}
                    </td>
                    <td className="p-2 font-mono">
                      <Link
                        href={`/purchases/vendor-credits/${c.vendorCredit.id}`}
                        className="hover:underline"
                      >
                        {c.vendorCredit.number}
                      </Link>
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoney(Number(c.amountApplied), cur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {/* ───── Notes / T&C ───── */}
      {(b.notes || b.termsAndConditions) ? (
        <div className="grid gap-4 md:grid-cols-2">
          {b.notes ? (
            <Card>
              <CardContent className="pt-6 space-y-2 text-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Notes <span className="text-amber-700">· internal only</span>
                </div>
                <p className="whitespace-pre-line">{b.notes}</p>
              </CardContent>
            </Card>
          ) : null}
          {b.termsAndConditions ? (
            <Card>
              <CardContent className="pt-6 space-y-2 text-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Terms &amp; conditions
                </div>
                <p className="whitespace-pre-line">{b.termsAndConditions}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ───── Status timestamps strip ───── */}
      <div className="text-xs text-muted-foreground space-x-3">
        {b.voidedAt ? (
          <span>Voided {format(b.voidedAt, "dd MMM yyyy, HH:mm")}</span>
        ) : null}
        {b.writtenOffAt ? (
          <span>
            Written off {format(b.writtenOffAt, "dd MMM yyyy, HH:mm")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
