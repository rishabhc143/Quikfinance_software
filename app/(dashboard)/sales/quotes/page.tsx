import { format } from "date-fns";
import { FileCheck } from "lucide-react";
import { RichEmptyState } from "@/components/shared/rich-empty-state";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { parseListSearchParams } from "@/lib/list-params";
import { StatusPill } from "@/components/ui/status-pill";
import { QUOTE_STATUS_VARIANT as STATUS_VARIANT } from "@/lib/constants/status";
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
  bulkDeleteQuotesAction,
  bulkEmailQuotesAction,
  bulkMarkQuotesAcceptedAction,
  bulkMarkQuotesSentAction,
} from "./actions";

export const metadata = { title: "Quotes" };

export default async function QuotesListPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; pageSize?: string; sort?: string; dir?: string; view?: string };
}) {
  const { organization } = await requireOrganization();
  const { q, page, pageSize, sort, dir } = parseListSearchParams(searchParams, {
    defaultSort: "issueDate",
  });
  // M17d: Saved Views chevron-dropdown is DB-backed.
  const savedViews = await getSavedViews(organization.id, "quotes");
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
      : { issueDate: dir };
  const customers = await db.contact.findMany({
    where: {
      organizationId: organization.id,
      type: { in: ["CUSTOMER", "BOTH"] },
      deletedAt: null,
    },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  const [quotes, total] = await Promise.all([
    db.quote.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { contact: { select: { displayName: true } } },
    }),
    db.quote.count({ where }),
  ]);

  const rows = quotes.map((qq) => ({
    id: qq.id,
    href: `/sales/quotes/${qq.id}`,
    cells: [
      <span key="date">{format(qq.issueDate, "dd MMM yyyy")}</span>,
      <span key="num" className="font-mono">
        {qq.number}
      </span>,
      <span key="ref">{qq.referenceNumber ?? "—"}</span>,
      <span key="cust">{qq.contact.displayName}</span>,
      <StatusPill key="st" variant={STATUS_VARIANT[qq.status] ?? "neutral"}>
        {qq.status}
      </StatusPill>,
      <span key="amt" className="text-right tabular-nums">
        {formatMoney(Number(qq.total), qq.currency)}
      </span>,
      <span key="exp">{qq.expiryDate ? format(qq.expiryDate, "dd MMM yyyy") : "—"}</span>,
    ],
  }));

  const empty = (
    <RichEmptyState
      icon={FileCheck}
      title="Seal the deal"
      description="Create professional quotes that turn prospects into customers."
      primaryAction={{ label: "Create New Quote", href: "/sales/quotes/new" }}
      secondaryAction={{ label: "Import File", href: "/sales/quotes/import" }}
      importUsingHref="/sales/quotes/import"
      benefits={[
        "Customize quote PDFs with your branding",
        "Convert accepted quotes into invoices or sales orders",
        "Track when a quote is viewed, accepted, or declined",
        "Send via email or share a portal link",
      ]}
    />
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Quotes"
        view="All quotes"
        views={savedViews.map((v) => ({
          value: v.slug,
          label: v.label,
          id: v.id,
          isSystem: v.isSystem,
        }))}
        activeView={view}
        newHref="/sales/quotes/new"
        newLabel="New"
        importHref="/sales/quotes/import"
        savedViewBuilder={
          <SavedViewBuilderDialog
            module="quotes"
            dateField="issueDate"
            amountField="total"
            customerOptions={customers.map((c) => ({ id: c.id, label: c.displayName }))}
            statusOptions={[
              { value: "DRAFT", label: "Draft" },
              { value: "SENT", label: "Sent" },
              { value: "ACCEPTED", label: "Accepted" },
              { value: "DECLINED", label: "Declined" },
              { value: "EXPIRED", label: "Expired" },
              { value: "INVOICED", label: "Invoiced" },
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
        exportHref="/api/sales/quotes/export"
        exportDialog={
          <SalesExportDialog
            entityLabel="Quotes"
            exportHref="/api/sales/quotes/export"
            statusOptions={[
              { value: "all", label: "All" },
              { value: "DRAFT", label: "Draft" },
              { value: "SENT", label: "Sent" },
              { value: "ACCEPTED", label: "Accepted" },
              { value: "DECLINED", label: "Declined" },
              { value: "EXPIRED", label: "Expired" },
              { value: "INVOICED", label: "Invoiced" },
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
        preferencesHref="/settings/preferences/quotes"
        customFieldsHref="/settings/preferences/quotes/custom-fields"
        sortOptions={[
          { label: "Date", value: "issueDate" },
          { label: "Quote number", value: "number" },
          { label: "Amount", value: "total" },
          { label: "Created time", value: "createdAt" },
        ]}
        columns={[
          { key: "date", header: "Date", sortable: true },
          { key: "number", header: "Quote #", sortable: true },
          { key: "ref", header: "Reference #" },
          { key: "cust", header: "Customer name" },
          { key: "status", header: "Status" },
          { key: "amount", header: "Amount", align: "right", sortable: true },
          { key: "expiry", header: "Expiry date" },
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
              { key: "number", header: "Quote #", sortable: true },
              { key: "ref", header: "Reference #" },
              { key: "cust", header: "Customer name" },
              { key: "status", header: "Status" },
              { key: "amount", header: "Amount", align: "right", sortable: true },
              { key: "expiry", header: "Expiry date" },
            ]}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sort={sort}
            dir={dir}
            search={q}
            rowNoun="quote"
            bulkActions={[
              {
                label: "Mark as Sent",
                doneVerb: "Marked",
                noun: "quote as sent",
                action: bulkMarkQuotesSentAction,
              },
              {
                label: "Mark as Accepted",
                doneVerb: "Marked",
                noun: "quote as accepted",
                action: bulkMarkQuotesAcceptedAction,
              },
              {
                label: "Print",
                hrefBase: "/sales/quotes/bulk-pdf",
              },
              {
                label: "Email",
                doneVerb: "Queued emails for",
                noun: "quote",
                action: bulkEmailQuotesAction,
              },
              {
                label: "Export Selected",
                hrefBase: "/api/sales/quotes/export", hrefQuery: { mode: "selected" },
              },
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "quote",
                confirm: "Delete the selected quotes? This is reversible (soft delete).",
                action: bulkDeleteQuotesAction,
              },
            ]}
          />
        }
      />
    </div>
  );
}
