import { format } from "date-fns";
import { ReceiptText } from "lucide-react";
import { SalesEmptyState } from "@/components/shared/sales-empty-state";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { StatusPill, type StatusVariant } from "@/components/ui/status-pill";
import { TransactionListPage } from "@/components/shared/transaction-list-page";
import { BulkAwareDataTable } from "@/components/shared/bulk-aware-data-table";
import { SalesExportDialog } from "@/components/shared/sales-export-dialog";
import { SavedViewBuilderDialog } from "@/components/shared/saved-view-builder-dialog";
import { formatMoney } from "@/lib/money";
import {
  bulkDeleteCreditNotesAction,
  bulkMarkCreditNotesOpenAction,
} from "./actions";

export const metadata = { title: "Credit Notes" };

// Map credit-note lifecycle to semantic StatusPill variants — OPEN info,
// CLOSED success (fully applied), VOID danger.
const STATUS_VARIANT: Record<string, StatusVariant> = {
  OPEN: "info",
  CLOSED: "success",
  VOID: "danger",
};

export default async function CreditNotesListPage({
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
            { number: { contains: q, mode: "insensitive" as const } },
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
    db.creditNote.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { contact: { select: { displayName: true } } },
    }),
    db.creditNote.count({ where }),
  ]);

  const rows = items.map((c) => {
    const balance =
      Number(c.total) - Number(c.amountApplied) - Number(c.amountRefunded);
    return {
      id: c.id,
      href: `/sales/credit-notes/${c.id}`,
      cells: [
        <span key="d">{format(c.date, "dd MMM yyyy")}</span>,
        <span key="n" className="font-mono">{c.number}</span>,
        <span key="r">{c.referenceNumber ?? "—"}</span>,
        <span key="c">{c.contact.displayName}</span>,
        <StatusPill key="s" variant={STATUS_VARIANT[c.status] ?? "neutral"}>{c.status}</StatusPill>,
        <span key="a" className="text-right tabular-nums">
          {formatMoney(Number(c.total), c.currency)}
        </span>,
        <span key="b" className="text-right tabular-nums">
          {formatMoney(balance, c.currency)}
        </span>,
      ],
    };
  });

  const empty = (
    <SalesEmptyState
      icon={ReceiptText}
      title="Issue credits with confidence"
      description="Apply credit notes to invoices or refund customers when there's a price adjustment."
      primaryAction={{ label: "Create Credit Note", href: "/sales/credit-notes/new" }}
      benefits={[
        "Apply credit to one or many open invoices",
        "Refund the unallocated balance",
        "Email credit-note PDFs",
        "Track running customer credit balance",
      ]}
    />
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Credit Notes"
        view="All credit notes"
        newHref="/sales/credit-notes/new"
        newLabel="New"
        savedViewBuilder={
          <SavedViewBuilderDialog
            module="credit_notes"
            dateField="creditNoteDate"
            amountField="total"
            customerOptions={customers.map((c) => ({ id: c.id, label: c.displayName }))}
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
        exportHref="/api/sales/credit-notes/export"
        exportDialog={
          <SalesExportDialog
            entityLabel="Credit Notes"
            exportHref="/api/sales/credit-notes/export"
            statusOptions={[
              { value: "all", label: "All" },
              { value: "OPEN", label: "Open" },
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
        customFieldsHref="/settings/preferences/credit-notes/custom-fields"
        columns={[
          { key: "date", header: "Date", sortable: true },
          { key: "number", header: "Credit note #" },
          { key: "ref", header: "Reference #" },
          { key: "cust", header: "Customer name" },
          { key: "status", header: "Status" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "balance", header: "Balance", align: "right" },
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
              { key: "date", header: "Date", sortable: true },
              { key: "number", header: "Credit note #" },
              { key: "ref", header: "Reference #" },
              { key: "cust", header: "Customer name" },
              { key: "status", header: "Status" },
              { key: "amount", header: "Amount", align: "right" },
              { key: "balance", header: "Balance", align: "right" },
            ]}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            search={q}
            rowNoun="credit note"
            bulkActions={[
              {
                label: "Mark as Open",
                doneVerb: "Marked",
                noun: "credit note as open",
                action: bulkMarkCreditNotesOpenAction,
              },
              {
                label: "Print",
                hrefBase: "/sales/credit-notes/bulk-pdf",
              },
              {
                label: "Export Selected",
                hrefBase: "/api/sales/credit-notes/export", hrefQuery: { mode: "selected" },
              },
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "credit note",
                confirm: "Delete the selected credit notes? Notes with applications/refunds cannot be deleted.",
                action: bulkDeleteCreditNotesAction,
              },
            ]}
          />
        }
      />
    </div>
  );
}
