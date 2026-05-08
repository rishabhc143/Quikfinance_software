import { format } from "date-fns";
import { Receipt } from "lucide-react";
import { SalesEmptyState } from "@/components/shared/sales-empty-state";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { TransactionListPage } from "@/components/shared/transaction-list-page";
import { BulkAwareDataTable } from "@/components/shared/bulk-aware-data-table";
import { SalesExportDialog } from "@/components/shared/sales-export-dialog";
import { SavedViewBuilderDialog } from "@/components/shared/saved-view-builder-dialog";
import { formatMoney } from "@/lib/money";
import {
  getSavedViews,
  resolveActiveView,
  whereForFilter,
} from "@/lib/sales/saved-views";
import {
  bulkDeleteInvoicesAction,
  bulkEmailInvoicesAction,
  bulkMarkInvoicesSentAction,
  bulkSendRemindersAction,
} from "./actions";
import { withDiagnostic } from "@/app/(dashboard)/sales/_diagnostic";

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

async function InvoicesListPage({
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
  // M17d: Saved Views chevron-dropdown is DB-backed (lazy-seeded
  // system views per Invoices Refinement Patch). M17a's "default =
  // Unpaid" is encoded as `isDefault: true` on the unpaid system row.
  const savedViews = await getSavedViews(organization.id, "invoices");
  const activeView = resolveActiveView(savedViews, searchParams.view);
  const view = activeView?.slug ?? "all";
  const statusFilter = activeView ? whereForFilter(activeView.filter) : {};

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
    <SalesEmptyState
      icon={Receipt}
      title="Bring your business to life with invoices"
      description="Send professional invoices, get paid faster, track every rupee."
      primaryAction={{ label: "Create New Invoice", href: "/sales/invoices/new" }}
      secondaryAction={{ label: "Import File", href: "/sales/invoices/import" }}
      importUsingHref="/sales/invoices/import"
      benefits={[
        "Email invoices with PDF attachments",
        "Accept payment via Razorpay portal link",
        "Set due-date reminders that auto-send",
        "Convert quotes into invoices in one click",
      ]}
    />
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title={
          view === "unpaid"
            ? "Unpaid Invoices"
            : view === "all"
            ? "All Invoices"
            : "Invoices"
        }
        view={
          view === "unpaid" ? undefined : view === "all" ? undefined : undefined
        }
        views={savedViews.map((v) => ({
          value: v.slug,
          label: v.label,
          id: v.id,
          isSystem: v.isSystem,
        }))}
        activeView={view}
        newHref="/sales/invoices/new"
        newLabel="New"
        importMenuItems={[
          { label: "Import Invoices", href: "/sales/invoices/import" },
          { label: "Import Debit Notes", href: "/sales/debit-notes/import" },
        ]}
        savedViewBuilder={
          <SavedViewBuilderDialog
            module="invoices"
            statusOptions={[
              { value: "DRAFT", label: "Draft" },
              { value: "SENT", label: "Sent" },
              { value: "PARTIALLY_PAID", label: "Partially Paid" },
              { value: "PAID", label: "Paid" },
              { value: "OVERDUE", label: "Overdue" },
              { value: "VOID", label: "Void" },
              { value: "WRITTEN_OFF", label: "Written Off" },
            ]}
            trigger={
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-primary hover:bg-accent rounded-sm"
              >
                + New Custom View
              </button>
            }
          />
        }
        exportHref="/api/sales/invoices/export"
        exportDialog={
          <SalesExportDialog
            entityLabel="Invoices"
            exportHref="/api/sales/invoices/export"
            statusOptions={[
              { value: "all", label: "All" },
              { value: "DRAFT", label: "Draft" },
              { value: "SENT", label: "Sent" },
              { value: "OVERDUE", label: "Overdue" },
              { value: "unpaid", label: "Unpaid" },
              { value: "PAID", label: "Paid" },
              { value: "VOID", label: "Void" },
              { value: "PARTIALLY_PAID", label: "Partially Paid" },
              { value: "WRITTEN_OFF", label: "Written Off" },
            ]}
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
        preferencesHref="/settings/preferences/invoices"
        customFieldsHref="/settings/preferences/invoices/custom-fields"
        onlinePaymentsHref="/settings/online-payments/customer-payments"
        sortOptions={[
          // M17a: 9 sort fields per spec — Order Number, Customer Name, Balance Due added.
          { label: "Created Time", value: "createdAt" },
          { label: "Last Modified Time", value: "updatedAt" },
          { label: "Date", value: "issueDate" },
          { label: "Invoice #", value: "number" },
          { label: "Order Number", value: "referenceNumber" },
          { label: "Customer Name", value: "customerName" },
          { label: "Due Date", value: "dueDate" },
          { label: "Amount", value: "total" },
          { label: "Balance Due", value: "balanceDue" },
        ]}
        columns={[
          { key: "date", header: "Date", sortable: true },
          { key: "number", header: "Invoice #", sortable: true },
          { key: "ref", header: "Order Number" },
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
              { key: "ref", header: "Order Number" },
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
                action: bulkMarkInvoicesSentAction,
              },
              {
                label: "Send Reminder",
                doneVerb: "Queued reminders for",
                noun: "invoice",
                action: bulkSendRemindersAction,
              },
              {
                label: "Print",
                hrefBase: "/sales/invoices/bulk-pdf",
              },
              {
                label: "Email",
                doneVerb: "Queued emails for",
                noun: "invoice",
                action: bulkEmailInvoicesAction,
              },
              {
                label: "Export Selected",
                hrefBase: "/api/sales/invoices/export", hrefQuery: { mode: "selected" },
              },
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "invoice",
                confirm: "Delete the selected invoices? Invoices with payments cannot be deleted.",
                action: bulkDeleteInvoicesAction,
              },
            ]}
          />
        }
      />
    </div>
  );
}


export default withDiagnostic("/sales/invoices", InvoicesListPage);
