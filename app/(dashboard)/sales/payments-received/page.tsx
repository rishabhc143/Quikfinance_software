import Link from "next/link";
import { format } from "date-fns";
import { Wallet, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { TransactionListPage } from "@/components/shared/transaction-list-page";
import { BulkAwareDataTable } from "@/components/shared/bulk-aware-data-table";
import { SalesExportDialog } from "@/components/shared/sales-export-dialog";
import { formatMoney } from "@/lib/money";
import { bulkDeletePaymentsAction } from "./actions";

export const metadata = { title: "Payments Received" };

export default async function PaymentsReceivedListPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; pageSize?: string };
}) {
  const { organization } = await requireOrganization();
  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const pageSize = Number(searchParams.pageSize ?? 25);

  const where = {
    organizationId: organization.id,
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" as const } },
            { reference: { contains: q, mode: "insensitive" as const } },
            { contact: { displayName: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.paymentReceived.findMany({
      where,
      orderBy: { paymentDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        contact: { select: { displayName: true } },
        allocations: { select: { invoice: { select: { number: true } } } },
      },
    }),
    db.paymentReceived.count({ where }),
  ]);

  const rows = items.map((p) => {
    const unused = Number(p.amount) - Number(p.amountUsedForInvoices);
    return {
      id: p.id,
      href: `/sales/payments-received/${p.id}`,
      cells: [
        <span key="d">{format(p.paymentDate, "dd MMM yyyy")}</span>,
        <span key="n" className="font-mono">{p.number}</span>,
        <span key="r">{p.reference ?? "—"}</span>,
        <span key="c">{p.contact.displayName}</span>,
        <span key="i">
          {p.allocations.map((a) => a.invoice.number).join(", ") || "—"}
        </span>,
        <span key="m">{p.paymentMode ?? "—"}</span>,
        <span key="a" className="text-right tabular-nums">
          {formatMoney(Number(p.amount), organization.currency)}
        </span>,
        <span key="u" className="text-right tabular-nums">
          {formatMoney(unused, organization.currency)}
        </span>,
      ],
    };
  });

  const empty = (
    <div className="space-y-4">
      <Wallet className="h-12 w-12 mx-auto text-primary" aria-hidden />
      <h2 className="text-xl font-semibold">No payments yet.</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Record customer payments here to keep your receivables accurate.
      </p>
      <Button asChild>
        <Link href="/sales/payments-received/new" className="gap-1">
          <Plus className="h-4 w-4" /> Record Payment
        </Link>
      </Button>
    </div>
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Payments Received"
        view="All payments"
        newHref="/sales/payments-received/new"
        newLabel="New payment"
        exportHref="/api/sales/payments-received/export"
        exportDialog={
          <SalesExportDialog
            entityLabel="Payments Received"
            exportHref="/api/sales/payments-received/export"
            statusOptions={[{ value: "all", label: "All" }]}
            trigger={
              <button
                type="button"
                className="block w-full px-2 py-1.5 text-left text-sm hover:bg-accent rounded-sm"
              >
                Export…
              </button>
            }
          />
        }
        columns={[
          { key: "date", header: "Date", sortable: true },
          { key: "number", header: "Payment #" },
          { key: "ref", header: "Reference #" },
          { key: "cust", header: "Customer name" },
          { key: "inv", header: "Invoice #" },
          { key: "mode", header: "Mode" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "unused", header: "Unused", align: "right" },
        ]}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        search={q}
        empty={empty}
        customTable={
          <BulkAwareDataTable
            columns={[
              { key: "date", header: "Date", sortable: true },
              { key: "number", header: "Payment #" },
              { key: "ref", header: "Reference #" },
              { key: "cust", header: "Customer name" },
              { key: "inv", header: "Invoice #" },
              { key: "mode", header: "Mode" },
              { key: "amount", header: "Amount", align: "right" },
              { key: "unused", header: "Unused", align: "right" },
            ]}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            search={q}
            rowNoun="payment"
            bulkActions={[
              {
                label: "Export Selected",
                hrefBase: "/api/sales/payments-received/export", hrefQuery: { mode: "selected" },
              },
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "payment",
                confirm: "Delete the selected payments? Payments with allocations cannot be deleted.",
                action: bulkDeletePaymentsAction,
              },
            ]}
          />
        }
      />
    </div>
  );
}
