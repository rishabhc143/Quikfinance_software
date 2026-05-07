import Link from "next/link";
import { format } from "date-fns";
import { Receipt, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TransactionListPage } from "@/components/shared/transaction-list-page";
import { BulkAwareDataTable } from "@/components/shared/bulk-aware-data-table";
import { formatMoney } from "@/lib/money";
import {
  bulkDeleteInvoicesAction,
  bulkEmailInvoicesAction,
  bulkMarkInvoicesSentAction,
  bulkSendRemindersAction,
} from "./actions";

export const metadata = { title: "Invoices" };

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  DRAFT: "outline",
  SENT: "secondary",
  PARTIALLY_PAID: "secondary",
  PAID: "secondary",
  OVERDUE: "destructive",
  VOID: "outline",
  WRITTEN_OFF: "outline",
};

export default async function InvoicesListPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; pageSize?: string; sort?: string; dir?: string; view?: string };
}) {
  const { organization } = await requireOrganization();
  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const pageSize = Number(searchParams.pageSize ?? 25);
  const sort = searchParams.sort ?? "issueDate";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const view = searchParams.view ?? "all";

  type InvStatus =
    | "DRAFT"
    | "SENT"
    | "PARTIALLY_PAID"
    | "PAID"
    | "OVERDUE"
    | "VOID"
    | "WRITTEN_OFF";

  const INV_VIEWS: Record<string, InvStatus | InvStatus[]> = {
    draft: "DRAFT",
    sent: "SENT",
    overdue: "OVERDUE",
    paid: "PAID",
    void: "VOID",
    partially_paid: "PARTIALLY_PAID",
    unpaid: ["SENT", "PARTIALLY_PAID", "OVERDUE"],
  };

  const viewFilter = INV_VIEWS[view];
  const statusFilter = Array.isArray(viewFilter)
    ? { status: { in: viewFilter } }
    : viewFilter
    ? { status: viewFilter }
    : {};

  const where = {
    organizationId: organization.id,
    deletedAt: null,
    ...statusFilter,
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" as const } },
            { referenceNumber: { contains: q, mode: "insensitive" as const } },
            { contact: { displayName: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const orderBy =
    sort === "number"
      ? { number: dir }
      : sort === "total"
      ? { total: dir }
      : sort === "dueDate"
      ? { dueDate: dir }
      : sort === "createdAt"
      ? { createdAt: dir }
      : { issueDate: dir };

  const [invoices, total] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { contact: { select: { displayName: true } } },
    }),
    db.invoice.count({ where }),
  ]);

  const rows = invoices.map((inv) => {
    const balance = Number(inv.total) - Number(inv.amountPaid);
    return {
      id: inv.id,
      href: `/sales/invoices/${inv.id}`,
      cells: [
        <span key="d">{format(inv.issueDate, "dd MMM yyyy")}</span>,
        <span key="n" className="font-mono">{inv.number}</span>,
        <span key="r">{inv.referenceNumber ?? "—"}</span>,
        <span key="c">{inv.contact.displayName}</span>,
        <Badge key="s" variant={STATUS_VARIANT[inv.status] ?? "outline"}>{inv.status}</Badge>,
        <span key="due">{format(inv.dueDate, "dd MMM yyyy")}</span>,
        <span key="a" className="text-right tabular-nums">
          {formatMoney(Number(inv.total), inv.currency ?? organization.currency)}
        </span>,
        <span key="b" className="text-right tabular-nums">
          {formatMoney(balance, inv.currency ?? organization.currency)}
        </span>,
      ],
    };
  });

  const empty = (
    <div className="space-y-6">
      <div className="rounded-lg border bg-background p-8 max-w-lg mx-auto space-y-4">
        <div className="mx-auto h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
          <Receipt className="h-10 w-10 text-primary" aria-hidden />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Bring your business to life with invoices.</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Send professional invoices, get paid faster, track every rupee.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Button asChild>
            <Link href="/sales/invoices/new" className="gap-1">
              <Plus className="h-4 w-4" /> Create New Invoice
            </Link>
          </Button>
          <Link href="/sales/invoices/import" className="text-sm text-primary hover:underline">
            Import Invoices
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Invoices"
        view="All invoices"
        views={[
          { value: "all", label: "All" },
          { value: "draft", label: "Draft" },
          { value: "sent", label: "Sent" },
          { value: "overdue", label: "Overdue" },
          { value: "unpaid", label: "Unpaid" },
          { value: "paid", label: "Paid" },
          { value: "void", label: "Void" },
          { value: "partially_paid", label: "Partially Paid" },
        ]}
        activeView={view}
        newHref="/sales/invoices/new"
        newLabel="New"
        importHref="/sales/invoices/import"
        exportHref="/api/sales/invoices/export"
        preferencesHref="/settings/preferences/invoices"
        sortOptions={[
          { label: "Date", value: "issueDate" },
          { label: "Due date", value: "dueDate" },
          { label: "Invoice number", value: "number" },
          { label: "Amount", value: "total" },
          { label: "Created time", value: "createdAt" },
        ]}
        columns={[
          { key: "date", header: "Date", sortable: true },
          { key: "number", header: "Invoice #", sortable: true },
          { key: "ref", header: "Reference #" },
          { key: "cust", header: "Customer name" },
          { key: "status", header: "Status" },
          { key: "due", header: "Due date", sortable: true },
          { key: "amount", header: "Amount", align: "right", sortable: true },
          { key: "balance", header: "Balance", align: "right" },
        ]}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        dir={dir}
        search={q}
        empty={empty}
        customTable={
          <BulkAwareDataTable
            columns={[
              { key: "date", header: "Date", sortable: true },
              { key: "number", header: "Invoice #", sortable: true },
              { key: "ref", header: "Reference #" },
              { key: "cust", header: "Customer name" },
              { key: "status", header: "Status" },
              { key: "due", header: "Due date", sortable: true },
              { key: "amount", header: "Amount", align: "right", sortable: true },
              { key: "balance", header: "Balance", align: "right" },
            ]}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sort={sort}
            dir={dir}
            search={q}
            rowNoun="invoice"
            bulkActions={[
              {
                label: "Mark as Sent",
                doneVerb: "Marked",
                noun: "invoice as sent",
                action: async (ids) => bulkMarkInvoicesSentAction({ ids }),
              },
              {
                label: "Send Reminder",
                doneVerb: "Queued reminders for",
                noun: "invoice",
                action: async (ids) => bulkSendRemindersAction({ ids }),
              },
              {
                label: "Print",
                href: (ids) =>
                  `/sales/invoices/bulk-pdf?ids=${ids.join(",")}`,
              },
              {
                label: "Email",
                doneVerb: "Queued emails for",
                noun: "invoice",
                action: async (ids) => bulkEmailInvoicesAction({ ids }),
              },
              {
                label: "Export Selected",
                href: (ids) =>
                  `/api/sales/invoices/export?mode=selected&ids=${ids.join(",")}`,
              },
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "invoice",
                confirm: "Delete the selected invoices? Invoices with payments cannot be deleted.",
                action: async (ids) => bulkDeleteInvoicesAction({ ids }),
              },
            ]}
          />
        }
      />
    </div>
  );
}
