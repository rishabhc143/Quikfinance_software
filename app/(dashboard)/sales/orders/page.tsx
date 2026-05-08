import Link from "next/link";
import { format } from "date-fns";
import { Truck, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-6">
      <div className="rounded-lg border bg-background p-8 max-w-lg mx-auto space-y-4">
        <div className="mx-auto h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
          <Truck className="h-10 w-10 text-primary" aria-hidden />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Start managing your sales activities!</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create, customize and send professional sales orders.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Button asChild>
            <Link href="/sales/orders/new" className="gap-1">
              <Plus className="h-4 w-4" /> Create Sales Order
            </Link>
          </Button>
          <Link href="/settings/integrations/bharat-connect" className="text-xs text-muted-foreground hover:text-foreground">
            Convert vendor purchase orders into sales orders via Bharat Connect — set up
          </Link>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 text-center">
          Life cycle of a Sales Order
        </div>
        <svg
          viewBox="0 0 800 100"
          className="mx-auto w-full max-w-3xl"
          role="img"
          aria-label="Sales Order lifecycle"
        >
          {[
            { x: 20, label: "Draft" },
            { x: 180, label: "Confirmed" },
            { x: 360, label: "Invoiced" },
            { x: 540, label: "Closed" },
          ].map((b, i, all) => (
            <g key={b.label}>
              <rect x={b.x} y={30} width={120} height={40} rx={6} fill="hsl(var(--muted))" stroke="hsl(var(--border))" />
              <text x={b.x + 60} y={55} textAnchor="middle" className="fill-foreground" fontSize={14}>{b.label}</text>
              {i < all.length - 1 ? <line x1={b.x + 120} y1={50} x2={all[i + 1].x} y2={50} stroke="hsl(var(--border))" /> : null}
            </g>
          ))}
        </svg>
      </div>

      <div className="border-t pt-4 max-w-lg mx-auto text-left">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">In the Sales Orders module, you can:</div>
        <ul className="space-y-1 text-sm">
          <li>• Confirm order details before creating an invoice</li>
          <li>• Convert sales orders to invoices or purchase orders</li>
          <li>• Track expected shipment dates</li>
        </ul>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Sales Orders"
        view="All sales orders"
        views={savedViews.map((v) => ({ value: v.slug, label: v.label }))}
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
                action: async (ids) => bulkMarkSalesOrdersOpenAction({ ids }),
              },
              {
                label: "Print",
                href: (ids) =>
                  `/sales/orders/bulk-pdf?ids=${ids.join(",")}`,
              },
              {
                label: "Email",
                doneVerb: "Queued emails for",
                noun: "sales order",
                action: async (ids) => bulkEmailSalesOrdersAction({ ids }),
              },
              {
                label: "Export Selected",
                href: (ids) =>
                  `/api/sales/orders/export?mode=selected&ids=${ids.join(",")}`,
              },
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "sales order",
                confirm: "Delete the selected sales orders? This is reversible (soft delete).",
                action: async (ids) => bulkDeleteSalesOrdersAction({ ids }),
              },
            ]}
          />
        }
      />
    </div>
  );
}
