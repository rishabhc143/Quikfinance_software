import { format } from "date-fns";
import { Receipt } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { StatusPill } from "@/components/ui/status-pill";
import { BILL_STATUS_VARIANT as STATUS_VARIANT } from "@/lib/constants/status";
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
  bulkDeleteBillsAction,
  bulkMarkBillsOpenAction,
  bulkVoidBillsAction,
} from "./actions";

export const metadata = { title: "Bills" };

const PAGE_SIZE_DEFAULT = 25;

type SearchParams = {
  q?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
  view?: string;
};

export default async function BillsListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { organization } = await requireOrganization();
  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const pageSize = Number(searchParams.pageSize ?? PAGE_SIZE_DEFAULT);
  const sort = searchParams.sort ?? "issueDate";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";

  const savedViews = await getSavedViews(organization.id, "bills");
  const activeView = resolveActiveView(savedViews, searchParams.view);
  const view = activeView?.slug ?? "unpaid";

  const where = {
    organizationId: organization.id,
    deletedAt: null,
    ...(activeView ? whereForFilter(activeView.filter) : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" as const } },
            {
              referenceNumber: { contains: q, mode: "insensitive" as const },
            },
            {
              contact: {
                displayName: {
                  contains: q,
                  mode: "insensitive" as const,
                },
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
      : sort === "dueDate"
      ? { dueDate: dir }
      : sort === "createdAt"
      ? { createdAt: dir }
      : { issueDate: dir };

  const vendors = await db.contact.findMany({
    where: {
      organizationId: organization.id,
      type: { in: ["VENDOR", "BOTH"] },
      deletedAt: null,
    },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  const [bills, total] = await Promise.all([
    db.bill.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { contact: { select: { displayName: true } } },
    }),
    db.bill.count({ where }),
  ]);

  const today = new Date();
  const rows = bills.map((b) => {
    const balanceDue = Number(b.total) - Number(b.amountPaid);
    // Derive an "OVERDUE" display flag even if the row's stored
    // status isn't OVERDUE yet — saves the OVERDUE cron from being
    // a hard prereq. The actual status flip lives in the cron.
    const displayStatus =
      b.status === "OPEN" &&
      balanceDue > 0 &&
      b.dueDate.getTime() < today.getTime()
        ? "OVERDUE"
        : b.status;
    return {
      id: b.id,
      href: `/purchases/bills/${b.id}`,
      cells: [
        <span key="d">{format(b.issueDate, "dd MMM yyyy")}</span>,
        <span key="n" className="font-mono">{b.number}</span>,
        <span key="r">{b.referenceNumber ?? "—"}</span>,
        <span key="v">{b.contact.displayName}</span>,
        <StatusPill key="s" variant={STATUS_VARIANT[displayStatus] ?? "neutral"}>
          {displayStatus.replaceAll("_", " ")}
        </StatusPill>,
        <span key="dd">{format(b.dueDate, "dd MMM yyyy")}</span>,
        <span key="a" className="text-right tabular-nums">
          {formatMoney(
            Number(b.total),
            b.currency ?? organization.currency
          )}
        </span>,
        <span key="bal" className="text-right tabular-nums">
          {formatMoney(
            balanceDue,
            b.currency ?? organization.currency
          )}
        </span>,
      ],
    };
  });

  const empty = (
    <RichEmptyState
      icon={Receipt}
      title="Start tracking what you owe"
      description="Bills are vendor invoices you've received. Track due dates, record payments, and never miss a payable."
      primaryAction={{
        label: "Create new bill",
        href: "/purchases/bills/new",
      }}
      secondaryAction={{
        label: "From a purchase order",
        href: "/purchases/orders",
      }}
      benefits={[
        "Enter vendor bill numbers manually with duplicate detection per vendor",
        "Link a Bill to a Purchase Order in one click",
        "Mark line items billable to a customer; pull them onto the next Invoice",
        "Track Open → Partially Paid → Paid lifecycle",
      ]}
    />
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Bills"
        view={viewLabel(view)}
        views={savedViews.map((v) => ({
          value: v.slug,
          label: v.label,
          id: v.id,
          isSystem: v.isSystem,
        }))}
        activeView={view}
        newHref="/purchases/bills/new"
        newLabel="New"
        importHref="/purchases/bills/import"
        savedViewBuilder={
          <SavedViewBuilderDialog
            module="bills"
            dateField="issueDate"
            amountField="total"
            customerOptions={vendors.map((v) => ({
              id: v.id,
              label: v.displayName,
            }))}
            statusOptions={[
              { value: "DRAFT", label: "Draft" },
              { value: "OPEN", label: "Open" },
              { value: "PARTIALLY_PAID", label: "Partially Paid" },
              { value: "PAID", label: "Paid" },
              { value: "OVERDUE", label: "Overdue" },
              { value: "VOID", label: "Void" },
              { value: "WRITTEN_OFF", label: "Written off" },
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
        customFieldsHref="/settings/preferences/bill/custom-fields"
        sortOptions={[
          { label: "Issue date", value: "issueDate" },
          { label: "Bill #", value: "number" },
          { label: "Due date", value: "dueDate" },
          { label: "Amount", value: "total" },
          { label: "Created time", value: "createdAt" },
        ]}
        columns={BILL_COLUMNS}
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
            columns={BILL_COLUMNS}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sort={sort}
            dir={dir}
            search={q}
            rowNoun="bill"
            bulkActions={[
              {
                label: "Mark Open",
                doneVerb: "Marked open",
                noun: "bill",
                action: bulkMarkBillsOpenAction,
              },
              {
                label: "Void",
                doneVerb: "Voided",
                noun: "bill",
                confirm:
                  "Void the selected bills? Voiding is reversible by editing; blocks any further payment.",
                action: bulkVoidBillsAction,
              },
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "bill",
                confirm:
                  "Delete the selected bills? Only Draft bills can be hard-deleted; the rest will soft-void.",
                action: bulkDeleteBillsAction,
              },
            ]}
          />
        }
      />
    </div>
  );
}

const BILL_COLUMNS = [
  { key: "date", header: "Date", sortable: true },
  { key: "number", header: "Bill #", sortable: true },
  { key: "ref", header: "Reference #" },
  { key: "vendor", header: "Vendor name" },
  { key: "status", header: "Status" },
  { key: "due", header: "Due date", sortable: true },
  {
    key: "amount",
    header: "Amount",
    align: "right" as const,
    sortable: true,
  },
  { key: "balance", header: "Balance due", align: "right" as const },
];

function viewLabel(view: string) {
  switch (view) {
    case "draft":
      return "Draft bills";
    case "unpaid":
      return "Unpaid bills";
    case "open":
      return "Open bills";
    case "overdue":
      return "Overdue bills";
    case "paid":
      return "Paid bills";
    case "void":
      return "Void bills";
    default:
      return "All bills";
  }
}
