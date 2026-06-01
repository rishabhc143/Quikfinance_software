import { format } from "date-fns";
import { ReceiptText } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { StatusPill } from "@/components/ui/status-pill";
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
import { bulkDeleteExpensesAction } from "./actions";

export const metadata = { title: "Expenses" };

const PAGE_SIZE_DEFAULT = 25;

type SearchParams = {
  q?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
  view?: string;
};

export default async function ExpensesListPage({
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

  const savedViews = await getSavedViews(organization.id, "expenses");
  const activeView = resolveActiveView(savedViews, searchParams.view);
  const view = activeView?.slug ?? "all";

  const where = {
    organizationId: organization.id,
    deletedAt: null,
    ...(activeView ? whereForFilter(activeView.filter) : {}),
    ...(q
      ? {
          OR: [
            { category: { contains: q, mode: "insensitive" as const } },
            { reference: { contains: q, mode: "insensitive" as const } },
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
    sort === "amount"
      ? { amount: dir }
      : sort === "category"
      ? { category: dir }
      : sort === "createdAt"
      ? { createdAt: dir }
      : { date: dir };

  const [expenses, total] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { contact: { select: { displayName: true } } },
    }),
    db.expense.count({ where }),
  ]);

  const rows = expenses.map((e) => ({
    id: e.id,
    href: `/purchases/expenses/${e.id}/edit`,
    cells: [
      <span key="d">{format(e.date, "dd MMM yyyy")}</span>,
      <span key="n" className="font-mono">{e.number ?? "—"}</span>,
      <span key="c" className="font-medium">{e.category}</span>,
      <span key="v">{e.contact?.displayName ?? "—"}</span>,
      <span key="r">{e.reference ?? "—"}</span>,
      <span key="b">
        {e.isBillable ? (
          <StatusPill variant={e.isBilled ? "success" : "info"}>
            {e.isBilled ? "Billed" : "Billable"}
          </StatusPill>
        ) : (
          "—"
        )}
      </span>,
      <span key="a" className="text-right tabular-nums">
        {formatMoney(Number(e.amount), organization.currency)}
      </span>,
    ],
  }));

  const empty = (
    <SalesEmptyState
      icon={ReceiptText}
      title="Track every business expense"
      description="Office supplies, subscriptions, travel — record once and they roll up across reports."
      primaryAction={{
        label: "Record expense",
        href: "/purchases/expenses/new",
      }}
      benefits={[
        "Quick-record without a vendor (cash) or against an existing vendor",
        "Mark expenses billable to a customer; pull onto their next Invoice",
        "Categorize against your Chart of Accounts",
        "Full-text search across category + reference",
      ]}
    />
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Expenses"
        view="All expenses"
        views={savedViews.map((v) => ({
          value: v.slug,
          label: v.label,
          id: v.id,
          isSystem: v.isSystem,
        }))}
        activeView={view}
        newHref="/purchases/expenses/new"
        newLabel="Record"
        savedViewBuilder={
          <SavedViewBuilderDialog
            module="expenses"
            dateField="date"
            amountField="amount"
            statusOptions={[
              { value: "BILLABLE", label: "Billable" },
              { value: "BILLED", label: "Billed" },
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
        customFieldsHref="/settings/preferences/expense/custom-fields"
        sortOptions={[
          { label: "Date", value: "date" },
          { label: "Category", value: "category" },
          { label: "Amount", value: "amount" },
          { label: "Created time", value: "createdAt" },
        ]}
        columns={EX_COLUMNS}
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
            columns={EX_COLUMNS}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sort={sort}
            dir={dir}
            search={q}
            rowNoun="expense"
            bulkActions={[
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "expense",
                confirm:
                  "Delete the selected expenses? Blocked for expenses already pulled onto a customer Invoice.",
                action: bulkDeleteExpensesAction,
              },
            ]}
          />
        }
      />
    </div>
  );
}

const EX_COLUMNS = [
  { key: "date", header: "Date", sortable: true },
  { key: "number", header: "Expense #" },
  { key: "category", header: "Category", sortable: true },
  { key: "vendor", header: "Vendor" },
  { key: "reference", header: "Reference" },
  { key: "billable", header: "Billable?" },
  { key: "amount", header: "Amount", align: "right" as const, sortable: true },
];
