import { notFound } from "next/navigation";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { writeAuditLog } from "@/lib/audit";
import { loadVisibleCustomFields } from "@/lib/sales/custom-fields-loader";
import { PayNowButton } from "./pay-now-button";

export const metadata = { title: "Invoice" };

const STATUS_COLOR: Record<string, "secondary" | "outline" | "destructive"> = {
  DRAFT: "outline",
  SENT: "secondary",
  PARTIALLY_PAID: "secondary",
  PAID: "secondary",
  OVERDUE: "destructive",
  VOID: "outline",
  WRITTEN_OFF: "outline",
};

export default async function InvoicePortalPage({
  params,
}: {
  params: { token: string };
}) {
  const inv = await db.invoice.findUnique({
    where: { portalAccessToken: params.token },
    include: { contact: true, lineItems: true, organization: true },
  });
  if (!inv || inv.deletedAt) notFound();

  // M17b: gate the Razorpay "Pay Now" button on per-org gateway config.
  const gatewayCfg = await db.paymentGatewayConfig.findUnique({
    where: { organizationId: inv.organizationId },
    select: { razorpayEnabled: true, razorpayKeyId: true },
  });
  const razorpayReady =
    !!gatewayCfg?.razorpayEnabled && !!gatewayCfg.razorpayKeyId;

  // M20: render custom fields with showOnPortal=true below customer notes.
  const customFields = await loadVisibleCustomFields({
    organizationId: inv.organizationId,
    entityType: "INVOICE",
    entityId: inv.id,
    surface: "portal",
  });

  // Track first-view
  if (!inv.sentAt && inv.status === "DRAFT") {
    // never publicly accessed yet — leave it; the merchant flips status
  }
  await writeAuditLog({
    organizationId: inv.organizationId,
    userId: null,
    action: "UPDATE",
    entityType: "InvoicePortalView",
    entityId: inv.id,
    after: { viewedAt: new Date().toISOString() },
  });

  const balance = Number(inv.total) - Number(inv.amountPaid);
  const ccy = inv.currency ?? inv.organization.currency;
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: ccy }).format(n);

  return (
    <main className="min-h-screen bg-muted/20 py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold">{inv.organization.name}</div>
            <div className="text-sm text-muted-foreground">Customer portal</div>
          </div>
          <Badge variant={STATUS_COLOR[inv.status] ?? "outline"} className="text-sm">
            {inv.status}
          </Badge>
        </header>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-semibold font-mono">{inv.number}</div>
                <div className="text-sm text-muted-foreground">
                  Issued {format(inv.issueDate, "dd MMM yyyy")} · Due{" "}
                  {format(inv.dueDate, "dd MMM yyyy")}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Balance due
                </div>
                <div className="text-3xl font-semibold">{fmtMoney(balance)}</div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 text-sm border-t pt-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Bill to
                </div>
                <div className="font-medium">{inv.contact.displayName}</div>
                {inv.contact.email ? (
                  <div className="text-muted-foreground">{inv.contact.email}</div>
                ) : null}
                {inv.contact.billingAddress ? (
                  <div className="whitespace-pre-line text-muted-foreground">
                    {inv.contact.billingAddress}
                  </div>
                ) : null}
              </div>
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
                {inv.lineItems.map((l) => (
                  <tr key={l.id}>
                    <td className="p-2">{l.description}</td>
                    <td className="p-2 text-right tabular-nums">{l.quantity.toString()}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(Number(l.rate))}</td>
                    <td className="p-2 text-right tabular-nums">
                      {fmtMoney(Number(l.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
              <Row label="Sub Total" value={fmtMoney(Number(inv.subtotal))} />
              {Number(inv.taxTotal) !== 0 ? (
                <Row label="Tax" value={fmtMoney(Number(inv.taxTotal))} />
              ) : null}
              {Number(inv.adjustmentValue) !== 0 ? (
                <Row
                  label={inv.adjustmentLabel ?? "Adjustment"}
                  value={fmtMoney(Number(inv.adjustmentValue))}
                />
              ) : null}
              <Row label="Total" value={fmtMoney(Number(inv.total))} bold />
              <Row label="Amount paid" value={fmtMoney(Number(inv.amountPaid))} />
              <Row label="Balance due" value={fmtMoney(balance)} bold />
            </div>
          </CardContent>
        </Card>

        {balance > 0.0001 &&
        ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status) ? (
          <div className="text-center">
            {razorpayReady ? (
              <PayNowButton
                portalToken={params.token}
                customerName={inv.contact.displayName}
                customerEmail={inv.contact.email}
                invoiceNumber={inv.number}
                organizationName={inv.organization.name}
              />
            ) : (
              <button
                type="button"
                disabled
                aria-disabled
                title="Online payment is not yet enabled on this account"
                className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow disabled:opacity-60"
              >
                Pay Now (not configured)
              </button>
            )}
          </div>
        ) : null}

        <div className="text-center">
          <a
            href={`/portal/invoices/${params.token}/payments`}
            className="text-sm text-primary hover:underline"
          >
            View all payments &amp; receipts &rarr;
          </a>
        </div>

        {inv.customerNotes ? (
          <Card>
            <CardContent className="pt-6 text-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Notes
              </div>
              <div className="whitespace-pre-line">{inv.customerNotes}</div>
            </CardContent>
          </Card>
        ) : null}

        {customFields.length > 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Additional Information
              </div>
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr]">
                {customFields.map((cf, i) => (
                  <div key={i} className="contents">
                    <dt className="text-muted-foreground">{cf.label}</dt>
                    <dd className="break-words">{cf.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${
        bold ? "border-t pt-2 font-semibold" : ""
      }`}
    >
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
