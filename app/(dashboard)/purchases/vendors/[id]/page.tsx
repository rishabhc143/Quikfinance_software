import Link from "next/link";
import { BackLink } from "@/components/shared/dirty-form-nav";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Pencil, MoreHorizontal, FileText, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteButton } from "@/components/shared/delete-button";
import { formatMoney } from "@/lib/money";
import { deleteVendorAction } from "../actions";

export const metadata = { title: "Vendor" };

/**
 * P2-A vendor detail page.
 *
 * Lean v1 — header + summary sidebar + tabbed transaction lists
 * (Bills / POs / Vendor Credits / Payments Made). Heavier features
 * like Statement export, mail history, and overview charts come with
 * the Bills sub-module in P4.
 *
 * Mirrors the customer detail page's grid layout so the visual
 * language stays consistent, but keeps the surface minimal — vendor
 * sub-resources won't all exist until P4-P7 anyway, so the tabs
 * gracefully degrade to empty states.
 */
export default async function VendorDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const v = await db.contact.findFirst({
    where: {
      id: params.id,
      organizationId: organization.id,
      type: { in: ["VENDOR", "BOTH"] },
    },
    include: {
      bankAccounts: { orderBy: { position: "asc" } },
    },
  });
  if (!v) notFound();

  const [bills, purchaseOrders, vendorCredits, paymentsMade] = await Promise.all([
    db.bill.findMany({
      where: {
        organizationId: organization.id,
        contactId: v.id,
        deletedAt: null,
      },
      orderBy: { issueDate: "desc" },
      take: 25,
      select: {
        id: true,
        number: true,
        status: true,
        issueDate: true,
        dueDate: true,
        total: true,
        amountPaid: true,
      },
    }),
    db.purchaseOrder.findMany({
      where: {
        organizationId: organization.id,
        contactId: v.id,
        deletedAt: null,
      },
      orderBy: { orderDate: "desc" },
      take: 25,
      select: {
        id: true,
        number: true,
        status: true,
        orderDate: true,
        total: true,
      },
    }),
    db.vendorCredit.findMany({
      where: {
        organizationId: organization.id,
        contactId: v.id,
        deletedAt: null,
      },
      orderBy: { date: "desc" },
      take: 25,
      select: {
        id: true,
        number: true,
        status: true,
        date: true,
        total: true,
        amountApplied: true,
        amountRefunded: true,
      },
    }),
    db.paymentMade.findMany({
      where: {
        organizationId: organization.id,
        contactId: v.id,
        deletedAt: null,
      },
      orderBy: { paymentDate: "desc" },
      take: 25,
      select: {
        id: true,
        number: true,
        paymentDate: true,
        amount: true,
        paymentMode: true,
      },
    }),
  ]);

  // Aggregate balances inline (same math as the list page so the
  // numbers reconcile).
  const payables = bills
    .filter((b) => ["OPEN", "PARTIALLY_PAID", "OVERDUE"].includes(b.status))
    .reduce((sum, b) => sum + (Number(b.total) - Number(b.amountPaid)), 0);
  const unusedCredits = vendorCredits
    .filter((c) => c.status === "OPEN")
    .reduce(
      (sum, c) =>
        sum +
        (Number(c.total) -
          Number(c.amountApplied) -
          Number(c.amountRefunded)),
      0
    );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link href="/purchases/vendors" className="hover:underline">
          Vendors
        </Link>
        <span className="mx-1">/</span>
        <span aria-current="page">{v.displayName}</span>
      </nav>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <BackLink href="/purchases/vendors"><ArrowLeft className="h-4 w-4" /></BackLink>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {v.displayName}
          </h1>
          {v.isInactive ? <Badge variant="outline">Inactive</Badge> : null}
          {v.msmeRegistered ? (
            <Badge variant="secondary" className="text-xs">
              MSME
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href={`/purchases/vendors/${v.id}/edit`}>
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
                <Link href={`/purchases/vendors/${v.id}/edit`}>Edit</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/purchases/bills/new">New bill</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/purchases/orders/new">New purchase order</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/purchases/payments-made/new">Record payment</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DeleteButton
            action={deleteVendorAction.bind(null, v.id)}
            confirmText="Delete this vendor? Blocked if open bills/POs/credits/payments exist."
            redirectTo="/purchases/vendors"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <aside className="space-y-3">
          <Card>
            <CardContent className="pt-6 space-y-2 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Payables (BCY)
                </div>
                <div className="text-xl font-semibold tabular-nums">
                  {formatMoney(payables, organization.currency)}
                </div>
              </div>
              <div className="border-t pt-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Unused credits (BCY)
                </div>
                <div className="text-base font-medium tabular-nums">
                  {formatMoney(unusedCredits, organization.currency)}
                </div>
              </div>
              {v.companyName ? (
                <div className="border-t pt-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Company
                  </div>
                  <div>{v.companyName}</div>
                </div>
              ) : null}
              {v.email ? (
                <div className="border-t pt-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Email
                  </div>
                  <div className="break-all">{v.email}</div>
                </div>
              ) : null}
              {v.workPhone ? (
                <div className="border-t pt-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Work phone
                  </div>
                  <div>{v.workPhone}</div>
                </div>
              ) : null}
              {v.mobile ? (
                <div className="border-t pt-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Mobile
                  </div>
                  <div>{v.mobile}</div>
                </div>
              ) : null}
              {v.gstin ? (
                <div className="border-t pt-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    GSTIN
                  </div>
                  <div className="font-mono text-xs">{v.gstin}</div>
                </div>
              ) : null}
              {v.pan ? (
                <div className="border-t pt-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    PAN
                  </div>
                  <div className="font-mono text-xs">{v.pan}</div>
                </div>
              ) : null}
              {v.msmeRegistered && v.msmeNumber ? (
                <div className="border-t pt-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    MSME #
                  </div>
                  <div className="font-mono text-xs">
                    {v.msmeNumber}
                    {v.msmeCategory ? ` · ${v.msmeCategory}` : ""}
                  </div>
                </div>
              ) : null}
              <div className="border-t pt-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Currency
                </div>
                <div>{v.currency ?? organization.currency}</div>
              </div>
            </CardContent>
          </Card>

          {v.bankAccounts.length > 0 ? (
            <Card>
              <CardContent className="pt-6 space-y-3 text-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Bank accounts
                </div>
                {v.bankAccounts.map((b) => (
                  <div
                    key={b.id}
                    className="border-t first:border-t-0 pt-2 first:pt-0"
                  >
                    <div className="font-medium">
                      {b.bankName ?? "Bank"}
                      {b.isDefault ? (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          Default
                        </Badge>
                      ) : null}
                    </div>
                    {b.accountHolderName ? (
                      <div className="text-muted-foreground">
                        {b.accountHolderName}
                      </div>
                    ) : null}
                    <div className="font-mono text-xs">
                      ••••{b.accountNumber.slice(-4)}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {b.ifscCode}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </aside>

        <main>
          <Tabs defaultValue="bills">
            <TabsList>
              <TabsTrigger value="bills">
                Bills ({bills.length})
              </TabsTrigger>
              <TabsTrigger value="pos">
                Purchase orders ({purchaseOrders.length})
              </TabsTrigger>
              <TabsTrigger value="credits">
                Credits ({vendorCredits.length})
              </TabsTrigger>
              <TabsTrigger value="payments">
                Payments ({paymentsMade.length})
              </TabsTrigger>
              <TabsTrigger value="overview">Overview</TabsTrigger>
            </TabsList>

            <TabsContent value="bills">
              <Card>
                <CardContent className="pt-4">
                  {bills.length === 0 ? (
                    <EmptyTab
                      label="No bills yet"
                      cta={{
                        label: "Create new bill",
                        href: "/purchases/bills/new",
                      }}
                    />
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase text-muted-foreground">
                        <tr className="text-left">
                          <th scope="col" className="p-2">Date</th>
                          <th scope="col" className="p-2">Bill#</th>
                          <th scope="col" className="p-2">Status</th>
                          <th scope="col" className="p-2">Due</th>
                          <th scope="col" className="p-2 text-right">Total</th>
                          <th scope="col" className="p-2 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {bills.map((b) => {
                          const bal = Number(b.total) - Number(b.amountPaid);
                          return (
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
                              <td className="p-2">
                                {format(b.dueDate, "dd MMM yyyy")}
                              </td>
                              <td className="p-2 text-right tabular-nums">
                                {formatMoney(b.total, organization.currency)}
                              </td>
                              <td className="p-2 text-right tabular-nums">
                                {formatMoney(bal, organization.currency)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pos">
              <Card>
                <CardContent className="pt-4">
                  {purchaseOrders.length === 0 ? (
                    <EmptyTab
                      label="No purchase orders yet"
                      cta={{
                        label: "Create new PO",
                        href: "/purchases/orders/new",
                      }}
                    />
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase text-muted-foreground">
                        <tr className="text-left">
                          <th scope="col" className="p-2">Date</th>
                          <th scope="col" className="p-2">PO#</th>
                          <th scope="col" className="p-2">Status</th>
                          <th scope="col" className="p-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {purchaseOrders.map((po) => (
                          <tr key={po.id}>
                            <td className="p-2">
                              {format(po.orderDate, "dd MMM yyyy")}
                            </td>
                            <td className="p-2 font-mono">
                              <Link
                                href={`/purchases/orders/${po.id}`}
                                className="hover:underline"
                              >
                                {po.number}
                              </Link>
                            </td>
                            <td className="p-2">
                              <Badge variant="outline" className="text-xs">
                                {po.status}
                              </Badge>
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {formatMoney(po.total, organization.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="credits">
              <Card>
                <CardContent className="pt-4">
                  {vendorCredits.length === 0 ? (
                    <EmptyTab
                      label="No vendor credits yet"
                      cta={{
                        label: "Create new credit",
                        href: "/purchases/vendor-credits/new",
                      }}
                    />
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase text-muted-foreground">
                        <tr className="text-left">
                          <th scope="col" className="p-2">Date</th>
                          <th scope="col" className="p-2">Credit Note#</th>
                          <th scope="col" className="p-2">Status</th>
                          <th scope="col" className="p-2 text-right">Total</th>
                          <th scope="col" className="p-2 text-right">Unused</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {vendorCredits.map((c) => {
                          const unused =
                            Number(c.total) -
                            Number(c.amountApplied) -
                            Number(c.amountRefunded);
                          return (
                            <tr key={c.id}>
                              <td className="p-2">
                                {format(c.date, "dd MMM yyyy")}
                              </td>
                              <td className="p-2 font-mono">
                                <Link
                                  href={`/purchases/vendor-credits/${c.id}`}
                                  className="hover:underline"
                                >
                                  {c.number}
                                </Link>
                              </td>
                              <td className="p-2">
                                <Badge variant="outline" className="text-xs">
                                  {c.status}
                                </Badge>
                              </td>
                              <td className="p-2 text-right tabular-nums">
                                {formatMoney(c.total, organization.currency)}
                              </td>
                              <td className="p-2 text-right tabular-nums">
                                {formatMoney(unused, organization.currency)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payments">
              <Card>
                <CardContent className="pt-4">
                  {paymentsMade.length === 0 ? (
                    <EmptyTab
                      label="No payments yet"
                      cta={{
                        label: "Record payment",
                        href: "/purchases/payments-made/new",
                      }}
                    />
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase text-muted-foreground">
                        <tr className="text-left">
                          <th scope="col" className="p-2">Date</th>
                          <th scope="col" className="p-2">Payment#</th>
                          <th scope="col" className="p-2">Mode</th>
                          <th scope="col" className="p-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {paymentsMade.map((p) => (
                          <tr key={p.id}>
                            <td className="p-2">
                              {format(p.paymentDate, "dd MMM yyyy")}
                            </td>
                            <td className="p-2 font-mono">
                              <Link
                                href={`/purchases/payments-made/${p.id}`}
                                className="hover:underline"
                              >
                                {p.number}
                              </Link>
                            </td>
                            <td className="p-2">{p.paymentMode ?? "—"}</td>
                            <td className="p-2 text-right tabular-nums">
                              {formatMoney(p.amount, organization.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="overview">
              <Card>
                <CardContent className="pt-6 space-y-3 text-sm">
                  <h2 className="text-sm font-semibold">Notes</h2>
                  {v.notes ? (
                    <p className="whitespace-pre-line">{v.notes}</p>
                  ) : (
                    <p className="text-muted-foreground">
                      No remarks recorded for this vendor.
                    </p>
                  )}
                  <h2 className="text-sm font-semibold pt-3 border-t">
                    Vendor portal
                  </h2>
                  <p className="text-muted-foreground">
                    Portal access is{" "}
                    {v.enableVendorPortal ? "enabled" : "disabled"}.
                    Vendor-facing portal pages ship in a later phase.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}

function EmptyTab({
  label,
  cta,
}: {
  label: string;
  cta: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-sm text-muted-foreground">
      <FileText className="h-8 w-8 opacity-40" />
      <span>{label}</span>
      <Button asChild size="sm" variant="outline" className="gap-1">
        <Link href={cta.href}>
          <Plus className="h-3.5 w-3.5" /> {cta.label}
        </Link>
      </Button>
    </div>
  );
}
