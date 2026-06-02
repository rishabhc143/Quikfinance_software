import { format } from "date-fns";
import { FileMinus } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { StatusPill } from "@/components/ui/status-pill";
import { VENDOR_CREDIT_STATUS_VARIANT as STATUS_VARIANT } from "@/lib/constants/status";
import { TransactionListPage } from "@/components/shared/transaction-list-page";
import { BulkAwareDataTable } from "@/components/shared/bulk-aware-data-table";
import { SavedViewBuilderDialog } from "@/components/shared/saved-view-builder-dialog";
import { SalesEmptyState } from "@/components/shared/sales-empty-state";
import { formatMoney } from "@/lib/money";
import {
  getSavedViews,
  resolveActiveView,
  whereForFilter,
} from "@/lib/sales/saved-views";
import { bulkDeleteVendorCreditsAction } from "./actions";

export const metadata = { title: "Vendor Credits" };

const PAGE_SIZE_DEFAULT = 25;

type SearchParams = {
  q?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
  view?: string;
};

export default async function VendorCreditsListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { organization } = await requireOrganization();
  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const pageSize = Number(searchParams.pageSize ?? PAGE_SIZE_DEFAULT);
  const sort = searchParams.sort ?? "date";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";

  const savedViews = await getSavedViews(organization.id, "vendor_credits");
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
      : { date: dir };

  const vendors = await db.contact.findMany({
    where: {
      organizationId: organization.id,
      type: { in: ["VENDOR", "BOTH"] },
      deletedAt: null,
    },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  const [credits, total] = await Promise.all([
    db.vendorCredit.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { contact: { select: { displayName: true } } },
    }),
    db.vendorCredit.count({ where }),
  ]);

  const rows = credits.map((c) => {
    const unused =
      Number(c.total) -
      Number(c.amountApplied) -
      Number(c.amountRefunded);
    return {
      id: c.id,
      href: `/purchases/vendor-credits/${c.id}`,
      cells: [
        <span key="d">{format(c.date, "dd MMM yyyy")}</span>,
        <span key="n" className="font-mono">{c.number}</span>,
        <span key="r">{c.referenceNumber ?? "—"}</span>,
        <span key="v">{c.contact.displayName}</span>,
        <StatusPill key="s" variant={STATUS_VARIANT[c.status] ?? "neutral"}>
          {c.status}
        </StatusPill>,
        <span key="t" className="text-right tabular-nums">
          {formatMoney(
            Number(c.total),
            c.currency ?? organization.currency
          )}
        </span>,
        <span key="u" className="text-right tabular-nums">
          {formatMoney(unused, c.currency ?? organization.currency)}
        </span>,
      ],
    };
  });

  const empty = (
    <SalesEmptyState
      icon={FileMinus}
      title="Track vendor credits and refunds"
      description="Credit notes from vendors can be applied to open bills or refunded back to your bank."
      primaryAction={{
        label: "New vendor credit",
        href: "/purchases/vendor-credits/new",
      }}
      benefits={[
        "Apply credits against multiple bills",
        "Record bank refunds against unused credits",
        "Label per spec: 'Credit Note#' with CN- prefix",
        "GST-compliant unused-credit tracking",
      ]}
    />
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Vendor Credits"
        view="All vendor credits"
        views={savedViews.map((v) => ({
          value: v.slug,
          label: v.label,
          id: v.id,
          isSystem: v.isSystem,
        }))}
        activeView={view}
        newHref="/purchases/vendor-credits/new"
        newLabel="New"
        importHref="/purchases/vendor-credits/import"
        savedViewBuilder={
          <SavedViewBuilderDialog
            module="vendor_credits"
            dateField="date"
            amountField="total"
            customerOptions={vendors.map((v) => ({
              id: v.id,
              label: v.displayName,
            }))}
            statusOptions={[
              { value: "OPEN", label: "Open" },
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
        preferencesHref="/settings/preferences/customers-and-vendors"
        customFieldsHref="/settings/preferences/vendor_credit/custom-fields"
        sortOptions={[
          { label: "Date", value: "date" },
          { label: "Credit Note #", value: "number" },
          { label: "Amount", value: "total" },
          { label: "Created time", value: "createdAt" },
        ]}
        columns={VC_COLUMNS}
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
            columns={VC_COLUMNS}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sort={sort}
            dir={dir}
            search={q}
            rowNoun="vendor credit"
            bulkActions={[
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "vendor credit",
                confirm:
                  "Delete the selected vendor credits? Soft-delete; blocked if any have applied or refunded amounts.",
                action: bulkDeleteVendorCreditsAction,
              },
            ]}
          />
        }
      />
    </div>
  );
}

const VC_COLUMNS = [
  { key: "date", header: "Date", sortable: true },
  { key: "number", header: "Credit Note #", sortable: true },
  { key: "ref", header: "Reference #" },
  { key: "vendor", header: "Vendor name" },
  { key: "status", header: "Status" },
  { key: "amount", header: "Amount", align: "right" as const, sortable: true },
  { key: "unused", header: "Unused", align: "right" as const },
];
