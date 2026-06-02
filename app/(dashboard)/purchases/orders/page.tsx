import Link from "next/link";
import { format } from "date-fns";
import { ShoppingBag } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { parseListSearchParams } from "@/lib/list-params";
import { StatusPill } from "@/components/ui/status-pill";
import { PURCHASE_ORDER_STATUS_VARIANT as STATUS_VARIANT } from "@/lib/constants/status";
import { TransactionListPage } from "@/components/shared/transaction-list-page";
import { BulkAwareDataTable } from "@/components/shared/bulk-aware-data-table";
import { SavedViewBuilderDialog } from "@/components/shared/saved-view-builder-dialog";
import { RichEmptyState } from "@/components/shared/rich-empty-state";
import { formatMoney } from "@/lib/money";
import {
  getSavedViews,
  resolveActiveView,
  whereForFilter,
} from "@/lib/sales/saved-views";
import {
  bulkCancelPurchaseOrdersAction,
  bulkClosePurchaseOrdersAction,
  bulkDeletePurchaseOrdersAction,
} from "./actions";

export const metadata = { title: "Purchase Orders" };

type SearchParams = {
  q?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
  view?: string;
};

export default async function PurchaseOrdersListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { organization } = await requireOrganization();
  const { q, page, pageSize, sort, dir } = parseListSearchParams(searchParams, {
    defaultSort: "orderDate",
  });

  const savedViews = await getSavedViews(organization.id, "purchase_orders");
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
            {
              contact: {
                displayName: { contains: q, mode: "insensitive" as const },
              },
            },
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
      : sort === "deliveryDate"
      ? { deliveryDate: dir }
      : { orderDate: dir };

  // Pre-fetch vendors for the saved-view builder's customer-multi-select
  // analog (PO views can filter by vendor).
  const vendors = await db.contact.findMany({
    where: {
      organizationId: organization.id,
      type: { in: ["VENDOR", "BOTH"] },
      deletedAt: null,
    },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  const [pos, total] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        contact: { select: { displayName: true } },
        bills: { select: { id: true }, take: 1 },
      },
    }),
    db.purchaseOrder.count({ where }),
  ]);

  const rows = pos.map((po) => ({
    id: po.id,
    href: `/purchases/orders/${po.id}`,
    cells: [
      <span key="d">{format(po.orderDate, "dd MMM yyyy")}</span>,
      <span key="n" className="font-mono">{po.number}</span>,
      <span key="r">{po.referenceNumber ?? "—"}</span>,
      <span key="v">{po.contact.displayName}</span>,
      <StatusPill key="s" variant={STATUS_VARIANT[po.status] ?? "neutral"}>
        {po.status.replaceAll("_", " ")}
      </StatusPill>,
      <span key="a" className="text-right tabular-nums">
        {formatMoney(Number(po.total), po.currency ?? organization.currency)}
      </span>,
      <span key="dd">
        {po.deliveryDate ? format(po.deliveryDate, "dd MMM yyyy") : "—"}
      </span>,
      <span key="b">{po.bills.length > 0 ? "Yes" : "No"}</span>,
    ],
  }));

  const empty = (
    <RichEmptyState
      icon={ShoppingBag}
      title="Start managing your purchase activities"
      description="Pre-commit purchases to vendors. Track expected deliveries, then convert to Bills when goods arrive."
      primaryAction={{
        label: "Create new purchase order",
        href: "/purchases/orders/new",
      }}
      secondaryAction={{ label: "Import file", href: "/purchases/orders" }}
      benefits={[
        "Lock in vendor commitments before goods ship",
        "Convert each PO into a Bill in one click",
        "Track partial vs full receipt status",
        "Email the PO directly to the vendor as a PDF",
      ]}
    />
  );

  // The vendors list is wired into the saved-view builder via the
  // customer-multi-select prop name (the component is module-agnostic;
  // for `purchase_orders` it filters by vendorId/contactId).
  const customerOptionsForBuilder = vendors.map((v) => ({
    id: v.id,
    label: v.displayName,
  }));

  return (
    <div className="p-6">
      <TransactionListPage
        title="Purchase Orders"
        view={viewLabel(view)}
        views={savedViews.map((v) => ({
          value: v.slug,
          label: v.label,
          id: v.id,
          isSystem: v.isSystem,
        }))}
        activeView={view}
        newHref="/purchases/orders/new"
        newLabel="New"
        savedViewBuilder={
          <SavedViewBuilderDialog
            module="purchase_orders"
            dateField="orderDate"
            amountField="total"
            customerOptions={customerOptionsForBuilder}
            statusOptions={[
              { value: "DRAFT", label: "Draft" },
              { value: "ISSUED", label: "Issued" },
              { value: "PARTIALLY_BILLED", label: "Partially Billed" },
              { value: "BILLED", label: "Billed" },
              { value: "CLOSED", label: "Closed" },
              { value: "CANCELLED", label: "Cancelled" },
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
        preferencesHref="/settings/preferences/customers-and-vendors"
        customFieldsHref="/settings/preferences/purchase_order/custom-fields"
        sortOptions={[
          { label: "Date", value: "orderDate" },
          { label: "PO number", value: "number" },
          { label: "Amount", value: "total" },
          { label: "Expected delivery", value: "deliveryDate" },
          { label: "Created time", value: "createdAt" },
        ]}
        columns={POL_COLUMNS}
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
            columns={POL_COLUMNS}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sort={sort}
            dir={dir}
            search={q}
            rowNoun="purchase order"
            bulkActions={[
              {
                label: "Mark Closed",
                doneVerb: "Closed",
                noun: "purchase order",
                action: bulkClosePurchaseOrdersAction,
              },
              {
                label: "Cancel",
                doneVerb: "Cancelled",
                noun: "purchase order",
                confirm:
                  "Cancel the selected purchase orders? They can be reopened by editing.",
                action: bulkCancelPurchaseOrdersAction,
              },
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "purchase order",
                confirm:
                  "Delete the selected purchase orders? Blocked if any are linked to bills.",
                action: bulkDeletePurchaseOrdersAction,
              },
            ]}
          />
        }
      />
      <p className="mt-4 text-xs text-muted-foreground">
        Need to import POs from another tool?{" "}
        <Link href="/purchases/vendors/import" className="underline">
          Import vendors first
        </Link>{" "}
        — POs require an existing vendor record.
      </p>
    </div>
  );
}

const POL_COLUMNS = [
  { key: "date", header: "Date", sortable: true },
  { key: "number", header: "PO #", sortable: true },
  { key: "ref", header: "Reference #" },
  { key: "vendor", header: "Vendor name" },
  { key: "status", header: "Status" },
  { key: "amount", header: "Amount", align: "right" as const, sortable: true },
  { key: "delivery", header: "Expected delivery" },
  { key: "billed", header: "Billed?" },
];

function viewLabel(view: string) {
  switch (view) {
    case "draft":
      return "Draft purchase orders";
    case "issued":
      return "Issued purchase orders";
    case "partially_billed":
      return "Partially billed purchase orders";
    case "billed":
      return "Billed purchase orders";
    case "closed":
      return "Closed purchase orders";
    case "cancelled":
      return "Cancelled purchase orders";
    default:
      return "All purchase orders";
  }
}
