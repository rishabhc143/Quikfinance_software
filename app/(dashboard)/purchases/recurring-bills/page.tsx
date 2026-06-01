import { format } from "date-fns";
import { Repeat } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { StatusPill, type StatusVariant } from "@/components/ui/status-pill";
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
  bulkPauseRecurringBillsAction,
  bulkResumeRecurringBillsAction,
  bulkDeleteRecurringBillsAction,
} from "./actions";

export const metadata = { title: "Recurring Bills" };

const PAGE_SIZE_DEFAULT = 25;

// Map recurring-bill lifecycle to semantic StatusPill variants — matches
// the sales/recurring-invoices convention.
const STATUS_VARIANT: Record<string, StatusVariant> = {
  ACTIVE: "success",
  PAUSED: "warning",
  EXPIRED: "neutral",
  STOPPED: "neutral",
};

type SearchParams = {
  q?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
  view?: string;
};

export default async function RecurringBillsListPage({
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

  const savedViews = await getSavedViews(organization.id, "recurring_bills");
  const activeView = resolveActiveView(savedViews, searchParams.view);
  const view = activeView?.slug ?? "all";

  const where = {
    organizationId: organization.id,
    deletedAt: null,
    ...(activeView ? whereForFilter(activeView.filter) : {}),
    ...(q
      ? {
          OR: [
            { profileName: { contains: q, mode: "insensitive" as const } },
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
    sort === "profileName"
      ? { profileName: dir }
      : sort === "amount"
      ? { amount: dir }
      : sort === "createdAt"
      ? { createdAt: dir }
      : { nextRunAt: dir };

  const vendors = await db.contact.findMany({
    where: {
      organizationId: organization.id,
      type: { in: ["VENDOR", "BOTH"] },
      deletedAt: null,
    },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  const [profiles, total] = await Promise.all([
    db.recurringBill.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { contact: { select: { displayName: true } } },
    }),
    db.recurringBill.count({ where }),
  ]);

  const rows = profiles.map((r) => ({
    id: r.id,
    href: `/purchases/recurring-bills/${r.id}`,
    cells: [
      <span key="p" className="font-medium">{r.profileName}</span>,
      <span key="v">{r.contact?.displayName ?? "—"}</span>,
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
      title="Set up recurring bill profiles"
      description="Rent, SaaS subscriptions, retainer fees — set the cadence once and Quikfinance queues the Bill on schedule."
      primaryAction={{
        label: "New profile",
        href: "/purchases/recurring-bills/new",
      }}
      benefits={[
        "Weekly / monthly / quarterly / yearly cadences",
        "Pause + resume any profile without losing history",
        "Linked-bills view shows every generated row",
        "Stops automatically on the end-date or N occurrences",
      ]}
    />
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Recurring Bills"
        view="All recurring bills"
        views={savedViews.map((v) => ({
          value: v.slug,
          label: v.label,
          id: v.id,
          isSystem: v.isSystem,
        }))}
        activeView={view}
        newHref="/purchases/recurring-bills/new"
        newLabel="New"
        importHref="/purchases/recurring-bills/import"
        savedViewBuilder={
          <SavedViewBuilderDialog
            module="recurring_bills"
            dateField="nextRunAt"
            amountField="amount"
            customerOptions={vendors.map((v) => ({
              id: v.id,
              label: v.displayName,
            }))}
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
        customFieldsHref="/settings/preferences/recurring_bill/custom-fields"
        sortOptions={[
          { label: "Next run", value: "nextRunAt" },
          { label: "Profile name", value: "profileName" },
          { label: "Amount", value: "amount" },
          { label: "Created time", value: "createdAt" },
        ]}
        columns={RB_COLUMNS}
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
            columns={RB_COLUMNS}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sort={sort}
            dir={dir}
            search={q}
            rowNoun="recurring profile"
            bulkActions={[
              {
                label: "Pause",
                doneVerb: "Paused",
                noun: "profile",
                action: bulkPauseRecurringBillsAction,
              },
              {
                label: "Resume",
                doneVerb: "Resumed",
                noun: "profile",
                action: bulkResumeRecurringBillsAction,
              },
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "profile",
                confirm:
                  "Delete the selected recurring profiles? Generated bills stay; only the schedule is removed.",
                action: bulkDeleteRecurringBillsAction,
              },
            ]}
          />
        }
      />
    </div>
  );
}

const RB_COLUMNS = [
  { key: "profile", header: "Profile", sortable: true },
  { key: "vendor", header: "Vendor name" },
  { key: "frequency", header: "Frequency" },
  { key: "next", header: "Next run", sortable: true },
  { key: "amount", header: "Amount", align: "right" as const, sortable: true },
  { key: "status", header: "Status" },
];
