import { format } from "date-fns";
import { Repeat } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/ui/status-pill";
import { RECURRING_STATUS_VARIANT as STATUS_VARIANT } from "@/lib/constants/status";
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
import {
  bulkPauseRecurringExpensesAction,
  bulkResumeRecurringExpensesAction,
  bulkDeleteRecurringExpensesAction,
} from "./actions";

export const metadata = { title: "Recurring Expenses" };

const PAGE_SIZE_DEFAULT = 25;

type SearchParams = {
  q?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
  view?: string;
};

export default async function RecurringExpensesListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { organization } = await requireOrganization();
  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const pageSize = Number(searchParams.pageSize ?? PAGE_SIZE_DEFAULT);
  const sort = searchParams.sort ?? "nextRunAt";
  const dir: "asc" | "desc" = searchParams.dir === "desc" ? "desc" : "asc";

  const savedViews = await getSavedViews(organization.id, "recurring_expenses");
  const activeView = resolveActiveView(savedViews, searchParams.view);
  const view = activeView?.slug ?? "all";

  const where = {
    organizationId: organization.id,
    deletedAt: null,
    ...(activeView ? whereForFilter(activeView.filter) : {}),
    ...(q
      ? {
          profileName: { contains: q, mode: "insensitive" as const },
        }
      : {}),
  };

  const orderBy =
    sort === "profileName"
      ? { profileName: dir }
      : sort === "amount"
      ? { amount: dir }
      : sort === "createdAt"
      ? { createdAt: dir }
      : { nextRunAt: dir };

  const [profiles, total] = await Promise.all([
    db.recurringExpense.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.recurringExpense.count({ where }),
  ]);

  const rows = profiles.map((r) => ({
    id: r.id,
    href: `/purchases/recurring-expenses/${r.id}`,
    cells: [
      <span key="p" className="font-medium">{r.profileName}</span>,
      <span key="c">{r.category ?? "—"}</span>,
      <Badge key="f" variant="outline">{r.frequency}</Badge>,
      <span key="n">{format(r.nextRunAt, "dd MMM yyyy")}</span>,
      <span key="a" className="text-right tabular-nums">
        {formatMoney(Number(r.amount), organization.currency)}
      </span>,
      <StatusPill key="s" variant={STATUS_VARIANT[r.status] ?? "neutral"}>
        {r.status}
      </StatusPill>,
    ],
  }));

  const empty = (
    <SalesEmptyState
      icon={Repeat}
      title="Set up recurring expense profiles"
      description="Out-of-pocket expenses that repeat — software subs, parking, regular travel. Quikfinance generates the Expense row on schedule."
      primaryAction={{
        label: "New profile",
        href: "/purchases/recurring-expenses/new",
      }}
      benefits={[
        "Weekly / monthly / quarterly / yearly cadences",
        "Pause + resume any profile without losing history",
        "Optional billable-to-customer for reimbursable expenses",
        "Generates Expense rows automatically on the schedule",
      ]}
    />
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Recurring Expenses"
        view="All recurring expenses"
        views={savedViews.map((v) => ({
          value: v.slug,
          label: v.label,
          id: v.id,
          isSystem: v.isSystem,
        }))}
        activeView={view}
        newHref="/purchases/recurring-expenses/new"
        newLabel="New"
        importHref="/purchases/recurring-expenses/import"
        savedViewBuilder={
          <SavedViewBuilderDialog
            module="recurring_expenses"
            dateField="nextRunAt"
            amountField="amount"
            statusOptions={[
              { value: "ACTIVE", label: "Active" },
              { value: "PAUSED", label: "Paused" },
              { value: "EXPIRED", label: "Expired" },
              { value: "STOPPED", label: "Stopped" },
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
        customFieldsHref="/settings/preferences/recurring_expense/custom-fields"
        sortOptions={[
          { label: "Next run", value: "nextRunAt" },
          { label: "Profile name", value: "profileName" },
          { label: "Amount", value: "amount" },
          { label: "Created time", value: "createdAt" },
        ]}
        columns={RE_COLUMNS}
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
            columns={RE_COLUMNS}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sort={sort}
            dir={dir}
            search={q}
            rowNoun="recurring expense"
            bulkActions={[
              {
                label: "Pause",
                doneVerb: "Paused",
                noun: "profile",
                action: bulkPauseRecurringExpensesAction,
              },
              {
                label: "Resume",
                doneVerb: "Resumed",
                noun: "profile",
                action: bulkResumeRecurringExpensesAction,
              },
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "profile",
                confirm:
                  "Delete the selected recurring expense profiles? Generated expenses stay; only the schedule is removed.",
                action: bulkDeleteRecurringExpensesAction,
              },
            ]}
          />
        }
      />
    </div>
  );
}

const RE_COLUMNS = [
  { key: "profile", header: "Profile", sortable: true },
  { key: "category", header: "Category" },
  { key: "frequency", header: "Frequency" },
  { key: "next", header: "Next run", sortable: true },
  { key: "amount", header: "Amount", align: "right" as const, sortable: true },
  { key: "status", header: "Status" },
];
