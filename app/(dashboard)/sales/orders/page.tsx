import { format } from "date-fns";
import { ShoppingBag } from "lucide-react";
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
  bulkDeleteSalesOrdersAction,
  bulkEmailSalesOrdersAction,
  bulkMarkSalesOrdersOpenAction,
} from "./actions";

export const metadata = { title: "Sales Orders" };

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  DRAFT: "outline",
  CONFIRMED: "secondary",
  CLOSED: "secondary",
  VOID: "destructive",
};

export default async function SalesOrdersListPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; pageSize?: string; sort?: string; dir?: string; view?: string };
}) {
  const { organization } = await requireOrganization();
  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const pageSize = Number(searchParams.pageSize ?? 25);
  const sort = searchParams.sort ?? "orderDate";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  // M17d: Saved Views chevron-dropdown is DB-backed.
  const savedViews = await getSavedViews(organization.id, "sales_orders");
  const activeView = resolveActiveView(savedViews, searchParams.view);
  const view = activeView?.slug ?? "all";

  const where = {
    organizationId: organization.id,
    deletedAt: null,
    ...(activeView ? whereForFilter(activeView.filter) : {}),
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
      : sort === "createdAt"
      ? { createdAt: dir }
      : { orderDate: dir };

  const [orders, total] = await Promise.all([
    db.salesOrder.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { contact: { select: { displayName: true } } },
    }),
    db.salesOrder.count({ where }),
  ]);

  const rows = orders.map((so) => ({
    id: so.id,
    href: `/sales/orders/${so.id}`,
    cells: [
      <span key="d">{format(so.orderDate, "dd MMM yyyy")}</span>,
      <span key="n" className="font-mono">{so.number}</span>,
      <span key="r">{so.referenceNumber ?? "—"}</span>,
      <span key="c">{so.contact.displayName}</span>,
      <Badge key="s" variant={STATUS_VARIANT[so.status] ?? "outline"}>{so.status}</Badge>,
      <span key="a" className="text-right tabular-nums">
        {formatMoney(Number(so.total), so.currency)}
      </span>,
      <span key="i">{so.convertedInvoiceId ? "Yes" : "No"}</span>,
    ],
  }));

  const empty = (
    <SalesEmptyState
      icon={ShoppingBag}
      title="Start managing your sales activities"
      description="Create, customize and send professional sales orders."
      primaryAction={{ label: "Create Sales Order", href: "/sales/orders/new" }}
      secondaryAction={{ label: "Import File", href: "/sales/orders/import" }}
      importUsingHref="/sales/orders/import"
      benefits={[
        "Confirm order details before invoicing",
        "Convert sales orders into invoices or purchase orders",
        "Track expected shipment dates",
        "Bulk export to CSV or print as a zip",
      ]}
    />
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Sales Orders"
        view="All sales orders"
        views={savedViews.map((v) => ({
          value: v.slug,
          label: v.label,
          id: v.id,
          isSystem: v.isSystem,
        }))}
        activeView={view}
        newHref="/sales/orders/new"
        newLabel="New"
        importHref="/sales/orders/import"
        savedViewBuilder={
          <SavedViewBuilderDialog
            module="sales_orders"
            statusOptions={[
              { value: "DRAFT", label: "Draft" },
              { value: "CONFIRMED", label: "Confirmed" },
              { value: "CLOSED", label: "Closed" },
              { value: "VOID", label: "Void" },
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
        exportHref="/api/sales/orders/export"
        exportDialog={
          <SalesExportDialog
            entityLabel="Sales Orders"
            exportHref="/api/sales/orders/export"
            statusOptions={[
              { value: "all", label: "All" },
              { value: "DRAFT", label: "Draft" },
              { value: "CONFIRMED", label: "Confirmed" },
              { value: "CLOSED", label: "Closed" },
              { value: "VOID", label: "Void" },
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
        preferencesHref="/settings/preferences/sales-orders"
        customFieldsHref="/settings/preferences/sales-orders/custom-fields"
        sortOptions={[
          { label: "Date", value: "orderDate" },
          { label: "Sales order number", value: "number" },
          { label: "Amount", value: "total" },
          { label: "Created time", value: "createdAt" },
        ]}
        columns={[
          { key: "date", header: "Date", sortable: true },
          { key: "number", header: "Sales order #", sortable: true },
          { key: "ref", header: "Reference #" },
          { key: "cust", header: "Customer name" },
          { key: "status", header: "Status" },
          { key: "amount", header: "Amount", align: "right", sortable: true },
          { key: "invoiced", header: "Invoiced?" },
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
              { key: "number", header: "Sales order #", sortable: true },
              { key: "ref", header: "Reference #" },
              { key: "cust", header: "Customer name" },
              { key: "status", header: "Status" },
              { key: "amount", header: "Amount", align: "right", sortable: true },
              { key: "invoiced", header: "Invoiced?" },
            ]}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sort={sort}
            dir={dir}
            search={q}
            rowNoun="sales order"
            bulkActions={[
              {
                label: "Mark as Open",
                doneVerb: "Marked",
                noun: "order as open",
                action: bulkMarkSalesOrdersOpenAction,
              },
              {
                label: "Print",
                hrefBase: "/sales/orders/bulk-pdf",
              },
              {
                label: "Email",
                doneVerb: "Queued emails for",
                noun: "sales order",
                action: bulkEmailSalesOrdersAction,
              },
              {
                label: "Export Selected",
                hrefBase: "/api/sales/orders/export", hrefQuery: { mode: "selected" },
              },
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "sales order",
                confirm: "Delete the selected sales orders? This is reversible (soft delete).",
                action: bulkDeleteSalesOrdersAction,
              },
            ]}
          />
        }
      />
    </div>
  );
}
