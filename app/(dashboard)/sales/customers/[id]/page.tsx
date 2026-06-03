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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteButton } from "@/components/shared/delete-button";
import { formatMoney } from "@/lib/money";
import {
  softDeleteCustomerAction,
  addRemarkAction,
  emailCustomerStatementAction,
  uploadCustomerDocumentsAction,
  deleteCustomerDocumentAction,
} from "../actions";
import { RemarkForm } from "./remark-form";
import { StatementForm } from "./statement-form";
import { DocumentsCard } from "./documents-card";
import { CustomerOverviewChart, type MonthlyPoint } from "./customer-overview-chart";

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const c = await db.contact.findFirst({
    where: {
      id: params.id,
      organizationId: organization.id,
      type: { in: ["CUSTOMER", "BOTH"] },
    },
    include: {
      addresses: true,
      contactPersons: { orderBy: { isPrimary: "desc" } },
      remarks: { orderBy: { createdAt: "desc" }, take: 50 },
      contactDocuments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!c) notFound();

  const [openInvoices, allDocs, mails] = await Promise.all([
    db.invoice.findMany({
      where: {
        contactId: c.id,
        deletedAt: null,
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
      },
      select: { total: true, amountPaid: true, status: true },
    }),
    Promise.all([
      db.invoice.findMany({
        where: { contactId: c.id, deletedAt: null },
        orderBy: { issueDate: "desc" },
        take: 10,
        select: { id: true, number: true, status: true, issueDate: true, total: true },
      }),
      db.quote.findMany({
        where: { contactId: c.id, deletedAt: null },
        orderBy: { issueDate: "desc" },
        take: 10,
        select: { id: true, number: true, status: true, issueDate: true, total: true },
      }),
      db.salesOrder.findMany({
        where: { contactId: c.id, deletedAt: null },
        orderBy: { orderDate: "desc" },
        take: 10,
        select: { id: true, number: true, status: true, orderDate: true, total: true },
      }),
      db.creditNote.findMany({
        where: { contactId: c.id, deletedAt: null },
        orderBy: { date: "desc" },
        take: 10,
        select: { id: true, number: true, status: true, date: true, total: true },
      }),
      db.paymentReceived.findMany({
        where: { contactId: c.id, deletedAt: null },
        orderBy: { paymentDate: "desc" },
        take: 10,
        select: {
          id: true,
          number: true,
          paymentDate: true,
          amount: true,
          paymentMode: true,
        },
      }),
    ]),
    db.emailJob.findMany({
      where: {
        organizationId: organization.id,
        toEmail: c.email ?? "__none__",
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        subject: true,
        status: true,
        createdAt: true,
        sentAt: true,
      },
    }),
  ]);

  const balance = openInvoices.reduce(
    (sum, i) => sum + (Number(i.total) - Number(i.amountPaid)),
    0
  );

  const [invoices, quotes, salesOrders, creditNotes, payments] = allDocs;

  // 12-month rolling income vs payments for the Overview chart
  const chartData: MonthlyPoint[] = (() => {
    const now = new Date();
    const points: MonthlyPoint[] = [];
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-US", { month: "short" }) + " " + String(d.getFullYear()).slice(2);
      points.push({ month: label, income: 0, payments: 0 });
      // Inline tag the key for matching below
      (points[points.length - 1] as MonthlyPoint & { _key: string })._key = key;
    }
    function keyOf(date: Date) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }
    for (const inv of invoices) {
      const slot = points.find(
        (p) => (p as MonthlyPoint & { _key?: string })._key === keyOf(inv.issueDate)
      );
      if (slot) slot.income += Number(inv.total);
    }
    for (const p of payments) {
      const slot = points.find(
        (pt) => (pt as MonthlyPoint & { _key?: string })._key === keyOf(p.paymentDate)
      );
      if (slot) slot.payments += Number(p.amount);
    }
    return points.map(({ _key, ...rest }: MonthlyPoint & { _key?: string }) => {
      void _key;
      return rest;
    });
  })();

  const transactions = [
    ...invoices.map((d) => ({
      kind: "Invoice",
      number: d.number,
      date: d.issueDate,
      total: Number(d.total),
      status: d.status,
      href: `/sales/invoices/${d.id}`,
    })),
    ...quotes.map((d) => ({
      kind: "Quote",
      number: d.number,
      date: d.issueDate,
      total: Number(d.total),
      status: String(d.status),
      href: `/sales/quotes/${d.id}`,
    })),
    ...salesOrders.map((d) => ({
      kind: "Sales Order",
      number: d.number,
      date: d.orderDate,
      total: Number(d.total),
      status: String(d.status),
      href: `/sales/orders/${d.id}`,
    })),
    ...creditNotes.map((d) => ({
      kind: "Credit Note",
      number: d.number,
      date: d.date,
      total: Number(d.total),
      status: d.status,
      href: `/sales/credit-notes/${d.id}`,
    })),
    ...payments.map((d) => ({
      kind: "Payment",
      number: d.number,
      date: d.paymentDate,
      total: Number(d.amount),
      status: d.paymentMode ?? "—",
      href: `/sales/payments-received/${d.id}`,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link href="/sales/customers" className="hover:underline">
          Customers
        </Link>
        <span className="mx-1">/</span>
        <span aria-current="page">{c.displayName}</span>
      </nav>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <BackLink href="/sales/customers"><ArrowLeft className="h-4 w-4" /></BackLink>
          </Button>
          <h1 className="text-2xl font-semibold">{c.displayName}</h1>
          {c.isInactive ? <Badge variant="outline">Inactive</Badge> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href={`/sales/customers/${c.id}/edit`}>
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
                <Link href={`/sales/customers/${c.id}/edit`}>Edit</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/sales/invoices/new">New invoice</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/sales/quotes/new">New quote</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DeleteButton
            action={softDeleteCustomerAction.bind(null, c.id)}
            confirmText="Delete this customer? It will be soft-deleted (restorable)."
            redirectTo="/sales/customers"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <aside className="space-y-3">
          <Card>
            <CardContent className="pt-6 space-y-2 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Receivables (BCY)
                </div>
                <div className="text-xl font-semibold">
                  {formatMoney(balance, organization.currency)}
                </div>
              </div>
              {c.companyName ? (
                <div className="border-t pt-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Company
                  </div>
                  <div>{c.companyName}</div>
                </div>
              ) : null}
              {c.email ? (
                <div className="border-t pt-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Email
                  </div>
                  <div className="break-all">{c.email}</div>
                </div>
              ) : null}
              {c.workPhone || c.phone ? (
                <div className="border-t pt-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Work phone
                  </div>
                  <div>{c.workPhone ?? c.phone}</div>
                </div>
              ) : null}
              {c.mobile ? (
                <div className="border-t pt-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Mobile
                  </div>
                  <div>{c.mobile}</div>
                </div>
              ) : null}
              {c.gstin ? (
                <div className="border-t pt-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    GSTIN
                  </div>
                  <div className="font-mono">{c.gstin}</div>
                </div>
              ) : null}
              <div className="border-t pt-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Currency
                </div>
                <div>{c.currency ?? organization.currency}</div>
              </div>
            </CardContent>
          </Card>

          {c.addresses.length > 0 ? (
            <Card>
              <CardContent className="pt-6 space-y-3 text-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Addresses
                </div>
                {c.addresses.map((a) => (
                  <div key={a.id} className="border-t first:border-t-0 pt-2 first:pt-0">
                    <div className="text-xs font-medium uppercase">{a.kind}</div>
                    <div className="whitespace-pre-line">
                      {[
                        a.attention,
                        a.addressLine1,
                        a.addressLine2,
                        [a.city, a.state, a.zipCode].filter(Boolean).join(", "),
                        a.country,
                      ]
                        .filter(Boolean)
                        .join("\n")}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <DocumentsCard
            contactId={c.id}
            initialDocuments={c.contactDocuments.map((d) => ({
              id: d.id,
              fileName: d.fileName,
              fileUrl: d.fileUrl,
              fileSize: d.fileSize,
              mimeType: d.mimeType,
              createdAt: d.createdAt,
            }))}
            uploadAction={uploadCustomerDocumentsAction}
            deleteAction={deleteCustomerDocumentAction}
          />

          {c.contactPersons.length > 0 ? (
            <Card>
              <CardContent className="pt-6 space-y-2 text-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Contact persons
                </div>
                {c.contactPersons.map((p) => (
                  <div key={p.id} className="border-t first:border-t-0 pt-2 first:pt-0">
                    <div className="font-medium">
                      {[p.salutation, p.firstName, p.lastName].filter(Boolean).join(" ")}
                      {p.isPrimary ? (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          Primary
                        </Badge>
                      ) : null}
                    </div>
                    {p.email ? <div className="text-muted-foreground">{p.email}</div> : null}
                    {p.workPhone ? (
                      <div className="text-muted-foreground">{p.workPhone}</div>
                    ) : null}
                    {p.mobile ? <div className="text-muted-foreground">{p.mobile}</div> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </aside>

        <main>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="comments">Comments</TabsTrigger>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
              <TabsTrigger value="mails">Mails</TabsTrigger>
              <TabsTrigger value="statements">Statements</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  <Stat
                    label="Receivables"
                    value={formatMoney(balance, organization.currency)}
                  />
                  <Stat
                    label="Unpaid invoices"
                    value={String(openInvoices.length)}
                  />
                  <Stat
                    label="Total invoices"
                    value={String(invoices.length)}
                  />
                  <Stat
                    label="Quotes"
                    value={String(quotes.length)}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <h2 className="text-sm font-semibold mb-3">
                    Last 12 months — Invoiced vs Paid
                  </h2>
                  <CustomerOverviewChart data={chartData} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  {c.notes ? (
                    <p className="text-sm whitespace-pre-line">{c.notes}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No notes yet.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="comments" className="space-y-3">
              <RemarkForm action={addRemarkAction.bind(null, c.id)} />
              {c.remarks.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-sm text-muted-foreground">
                    No comments yet — add the first one above.
                  </CardContent>
                </Card>
              ) : (
                c.remarks.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="pt-4 space-y-1 text-sm">
                      <div className="text-xs text-muted-foreground">
                        {format(r.createdAt, "dd MMM yyyy, HH:mm")}
                      </div>
                      <div className="whitespace-pre-line">{r.body}</div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="transactions">
              <Card>
                <CardContent className="pt-4">
                  {transactions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No transactions yet for this customer.
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <caption className="sr-only">
                        Recent transactions for {c.displayName}
                      </caption>
                      <thead className="text-xs uppercase text-muted-foreground">
                        <tr className="text-left">
                          <th scope="col" className="p-2">Date</th>
                          <th scope="col" className="p-2">Type</th>
                          <th scope="col" className="p-2">Number</th>
                          <th scope="col" className="p-2">Status</th>
                          <th scope="col" className="p-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {transactions.map((t, i) => (
                          <tr key={`${t.kind}-${t.number}-${i}`}>
                            <td className="p-2">{format(t.date, "dd MMM yyyy")}</td>
                            <td className="p-2">
                              <Badge variant="outline">{t.kind}</Badge>
                            </td>
                            <td className="p-2 font-mono">
                              <Link href={t.href} className="hover:underline">
                                {t.number}
                              </Link>
                            </td>
                            <td className="p-2">{t.status}</td>
                            <td className="p-2 text-right tabular-nums">
                              {formatMoney(t.total, organization.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="mails">
              <Card>
                <CardContent className="pt-4">
                  {mails.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No emails sent to this customer yet.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {mails.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between border-b pb-2 last:border-b-0"
                        >
                          <div>
                            <div className="font-medium">{m.subject}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(m.sentAt ?? m.createdAt, "dd MMM yyyy, HH:mm")}
                            </div>
                          </div>
                          <Badge variant={m.status === "SENT" ? "secondary" : "outline"}>
                            {m.status}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="statements">
              <Card>
                <CardContent className="pt-6">
                  <StatementForm
                    customerId={c.id}
                    customerEmail={c.email}
                    emailAction={emailCustomerStatementAction}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
