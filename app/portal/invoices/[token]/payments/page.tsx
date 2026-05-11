import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Receipt } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { writeAuditLog } from "@/lib/audit";

export const metadata = { title: "Payments" };

/**
 * Customer-facing payments-received page, nested under an invoice
 * portal token. Auth model: anyone with a valid invoice token can
 * see all payments by *that invoice's customer* — same trust level
 * as the existing invoice portal page.
 *
 * Why nest under [token] rather than build a /portal/customers/...
 * route: avoids a schema migration to add Contact.portalAccessToken.
 * If we later need per-customer (non-invoice-scoped) portal access
 * for things like statements, that's the time to add a contact token.
 */
export default async function PaymentsPortalPage({
  params,
}: {
  params: { token: string };
}) {
  const inv = await db.invoice.findUnique({
    where: { portalAccessToken: params.token },
    include: { organization: true },
  });
  if (!inv || inv.deletedAt) notFound();

  // All non-refunded payments for this customer (negative-amount
  // reversal rows show the refund history; we list those too so
  // customers can see "you paid 1000 / we refunded 200" transparently).
  const payments = await db.paymentReceived.findMany({
    where: {
      organizationId: inv.organizationId,
      contactId: inv.contactId,
      deletedAt: null,
    },
    orderBy: { paymentDate: "desc" },
    include: {
      allocations: {
        include: {
          invoice: { select: { id: true, number: true, total: true } },
        },
      },
    },
  });

  await writeAuditLog({
    organizationId: inv.organizationId,
    userId: null,
    action: "UPDATE",
    entityType: "PaymentsPortalView",
    entityId: inv.contactId,
    after: {
      viewedAt: new Date().toISOString(),
      viaInvoice: inv.number,
    },
  });

  const ccy = inv.currency ?? inv.organization.currency;
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: ccy,
    }).format(n);

  const totalPaid = payments
    .filter((p) => Number(p.amount) > 0)
    .reduce((s, p) => s + Number(p.amount), 0);
  const totalRefunded = payments
    .filter((p) => Number(p.amount) < 0)
    .reduce((s, p) => s + Math.abs(Number(p.amount)), 0);

  return (
    <main className="min-h-screen bg-muted/20 py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold">
              {inv.organization.name}
            </div>
            <div className="text-sm text-muted-foreground">
              Payment history
            </div>
          </div>
          <Link
            href={`/portal/invoices/${params.token}`}
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to invoice {inv.number}
          </Link>
        </header>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="py-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Payments
              </div>
              <div className="text-xl font-semibold tabular-nums mt-1">
                {payments.filter((p) => Number(p.amount) > 0).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Total paid
              </div>
              <div className="text-xl font-semibold tabular-nums mt-1">
                {fmtMoney(totalPaid)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Refunded
              </div>
              <div
                className={
                  "text-xl font-semibold tabular-nums mt-1 " +
                  (totalRefunded > 0 ? "text-destructive" : "text-muted-foreground")
                }
              >
                {fmtMoney(totalRefunded)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payments list */}
        {payments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <Receipt
                className="h-10 w-10 mx-auto text-muted-foreground/50"
                strokeWidth={1.5}
              />
              <p className="text-sm text-muted-foreground">
                No payments recorded yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Reference</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4">Applied to</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const amt = Number(p.amount);
                      const isRefund = amt < 0;
                      return (
                        <tr
                          key={p.id}
                          className="border-b last:border-b-0 hover:bg-muted/40"
                        >
                          <td className="py-3 px-4 tabular-nums">
                            {format(p.paymentDate, "dd MMM yyyy")}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs">
                            {p.number}
                            {isRefund ? (
                              <Badge
                                variant="outline"
                                className="ml-2 text-xs border-destructive/40 text-destructive"
                              >
                                Refund
                              </Badge>
                            ) : null}
                          </td>
                          <td className="py-3 px-4 capitalize">
                            {p.paymentMode ?? p.method ?? "—"}
                          </td>
                          <td className="py-3 px-4">
                            {p.allocations.length === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                Unallocated
                              </span>
                            ) : (
                              <div className="space-y-0.5 text-xs">
                                {p.allocations.map((a) => (
                                  <div
                                    key={a.id}
                                    className="font-mono text-muted-foreground"
                                  >
                                    {a.invoice.number}{" "}
                                    <span className="text-foreground">
                                      ({fmtMoney(Number(a.amount))})
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td
                            className={
                              "py-3 px-4 text-right tabular-nums font-semibold " +
                              (isRefund ? "text-destructive" : "")
                            }
                          >
                            {fmtMoney(amt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Questions? Reply to the email this link came from.
        </p>
      </div>
    </main>
  );
}
