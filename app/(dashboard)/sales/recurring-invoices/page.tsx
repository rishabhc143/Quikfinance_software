import { format } from "date-fns";
import { Repeat } from "lucide-react";
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
  bulkDeleteRecurringAction,
  bulkResumeRecurringAction,
  bulkStopRecurringAction,
} from "./actions";

export const metadata = { title: "Recurring Invoices" };

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  ACTIVE: "secondary",
  PAUSED: "outline",
  STOPPED: "destructive",
  EXPIRED: "outline",
};

export default async function RecurringInvoicesListPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; pageSize?: string };
}) {
  const { organization } = await requireOrganization();
  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const pageSize = Number(searchParams.pageSize ?? 25);

  const where = {
    organizationId: organization.id,
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { profileName: { contains: q, mode: "insensitive" as const } },
            { contact: { displayName: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const customers = await db.contact.findMany({
    where: {
      organizationId: organization.id,
      type: { in: ["CUSTOMER", "BOTH"] },
      deletedAt: null,
    },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  const [items, total] = await Promise.all([
    db.recurringInvoice.findMany({
      where,
      orderBy: { nextOccurrenceDate: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { contact: { select: { displayName: true } } },
    }),
    db.recurringInvoice.count({ where }),
  ]);

  const rows = items.map((r) => ({
    id: r.id,
    href: `/sales/recurring-invoices/${r.id}`,
    cells: [
      <span key="p" className="font-medium">{r.profileName}</span>,
      <span key="c">{r.contact.displayName}</span>,
      <span key="f">
        {r.frequency === "EVERY_N_MONTHS" ? `Every ${r.intervalN} months` : r.frequency}
      </span>,
      <span key="s">{format(r.startDate, "dd MMM yyyy")}</span>,
      <span key="n">{format(r.nextOccurrenceDate, "dd MMM yyyy")}</span>,
      <Badge key="st" variant={STATUS_VARIANT[r.status] ?? "outline"}>{r.status}</Badge>,
      <span key="a" className="text-right tabular-nums">
        {formatMoney(Number(r.amount), organization.currency)}
      </span>,
    ],
  }));

  const empty = (
    <SalesEmptyState
      icon={Repeat}
      title="Set it once, bill on autopilot"
      description="Recurring profiles generate invoices automatically on the schedule you choose."
      primaryAction={{ label: "Create Recurring Profile", href: "/sales/recurring-invoices/new" }}
      benefits={[
        "Daily, weekly, monthly, or custom frequencies",
        "Pause or stop a profile at any time",
        "Auto-deliver via email when generated",
        "Sync with Razorpay subscription billing",
      ]}
    />
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Recurring Invoices"
        view="All profiles"
        newHref="/sales/recurring-invoices/new"
        newLabel="New profile"
        savedViewBuilder={
          <SavedViewBuilderDialog
            module="recurring_invoices"
            dateField="nextOccurrenceDate"
            amountField="amount"
            customerOptions={customers.map((c) => ({ id: c.id, label: c.displayName }))}
            statusOptions={[
              { value: "ACTIVE", label: "Active" },
              { value: "PAUSED", label: "Paused" },
              { value: "STOPPED", label: "Stopped" },
              { value: "EXPIRED", label: "Expired" },
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
        exportHref="/api/sales/recurring-invoices/export"
        exportDialog={
          <SalesExportDialog
            entityLabel="Recurring Invoices"
            exportHref="/api/sales/recurring-invoices/export"
            statusOptions={[
              { value: "all", label: "All" },
              { value: "ACTIVE", label: "Active" },
              { value: "PAUSED", label: "Paused" },
              { value: "STOPPED", label: "Stopped" },
              { value: "EXPIRED", label: "Expired" },
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
        columns={[
          { key: "profile", header: "Profile name", sortable: true },
          { key: "cust", header: "Customer name" },
          { key: "freq", header: "Frequency" },
          { key: "start", header: "Start date" },
          { key: "next", header: "Next invoice date" },
          { key: "status", header: "Status" },
          { key: "amount", header: "Amount", align: "right" },
        ]}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        search={q}
        empty={empty}
        customTable={
          <BulkAwareDataTable
            columns={[
              { key: "profile", header: "Profile name", sortable: true },
              { key: "cust", header: "Customer name" },
              { key: "freq", header: "Frequency" },
              { key: "start", header: "Start date" },
              { key: "next", header: "Next invoice date" },
              { key: "status", header: "Status" },
              { key: "amount", header: "Amount", align: "right" },
            ]}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            search={q}
            rowNoun="profile"
            bulkActions={[
              {
                label: "Stop",
                doneVerb: "Stopped",
                noun: "profile",
                action: bulkStopRecurringAction,
              },
              {
                label: "Resume",
                doneVerb: "Resumed",
                noun: "profile",
                action: bulkResumeRecurringAction,
              },
              {
                label: "Export Selected",
                hrefBase: "/api/sales/recurring-invoices/export", hrefQuery: { mode: "selected" },
              },
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "profile",
                confirm: "Delete the selected recurring profiles? This is reversible (soft delete).",
                action: bulkDeleteRecurringAction,
              },
            ]}
          />
        }
      />
    </div>
  );
}
