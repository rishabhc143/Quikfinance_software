import { format } from "date-fns";
import { FileMinus } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { StatusPill, type StatusVariant } from "@/components/ui/status-pill";
import { SalesEmptyState } from "@/components/shared/sales-empty-state";
import { TransactionListPage } from "@/components/shared/transaction-list-page";
import { BulkAwareDataTable } from "@/components/shared/bulk-aware-data-table";
import {
  bulkDeleteDebitNotesAction,
  bulkVoidDebitNotesAction,
} from "./actions";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Debit Notes" };

// Map debit-note lifecycle to semantic StatusPill variants.
const STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: "neutral",
  OPEN: "info",
  VOID: "danger",
};

/**
 * M17f: minimal Debit Notes list. Schema is in (M17a); the spec
 * scaffolds the model + import wizard with full UI a follow-up. The
 * import action below is what makes this page useful today — it
 * lets the merchant import customer debit notes via CSV.
 */
export default async function DebitNotesListPage({
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
            { debitNoteNumber: { contains: q, mode: "insensitive" as const } },
            {
              contact: {
                displayName: { contains: q, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.debitNote.findMany({
      where,
      orderBy: { debitNoteDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { contact: { select: { displayName: true } } },
    }),
    db.debitNote.count({ where }),
  ]);

  const rows = items.map((d) => ({
    id: d.id,
    href: `/sales/debit-notes/${d.id}`,
    cells: [
      <span key="d">{format(d.debitNoteDate, "dd MMM yyyy")}</span>,
      <span key="n" className="font-mono">
        {d.debitNoteNumber}
      </span>,
      <span key="ref">{d.referenceNumber ?? "—"}</span>,
      <span key="c">{d.contact.displayName}</span>,
      <StatusPill key="s" variant={STATUS_VARIANT[d.status] ?? "neutral"}>
        {d.status}
      </StatusPill>,
      <span key="t" className="text-right tabular-nums">
        {formatMoney(Number(d.total), d.currency)}
      </span>,
    ],
  }));

  const empty = (
    <SalesEmptyState
      icon={FileMinus}
      title="Track customer adjustments"
      description="Issue a debit note when you need to increase what a customer owes — late fees, price corrections, or extra services on a closed invoice."
      primaryAction={{ label: "Create Debit Note", href: "/sales/debit-notes/new" }}
      secondaryAction={{ label: "Import Debit Notes", href: "/sales/debit-notes/import" }}
      benefits={[
        "Increase a customer's outstanding balance",
        "Reference the original Invoice on every debit note",
        "Import historical debit notes from CSV",
        "GST-compliant CN-prefixed numbering",
      ]}
    />
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Debit Notes"
        view="All debit notes"
        newHref="/sales/debit-notes/new"
        newLabel="New"
        importHref="/sales/debit-notes/import"
        customFieldsHref="/settings/preferences/debit-notes/custom-fields"
        columns={[
          { key: "date", header: "Date", sortable: true },
          { key: "number", header: "Debit note #" },
          { key: "ref", header: "Reference #" },
          { key: "cust", header: "Customer name" },
          { key: "status", header: "Status" },
          { key: "total", header: "Amount", align: "right" },
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
              { key: "number", header: "Debit note #" },
              { key: "ref", header: "Reference #" },
              { key: "cust", header: "Customer name" },
              { key: "status", header: "Status" },
              { key: "total", header: "Amount", align: "right" },
            ]}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            search={q}
            rowNoun="debit note"
            bulkActions={[
              {
                label: "Mark as Void",
                doneVerb: "Voided",
                noun: "debit note",
                action: bulkVoidDebitNotesAction,
              },
              {
                label: "Print",
                hrefBase: "/sales/debit-notes/bulk-pdf",
              },
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "debit note",
                confirm:
                  "Delete the selected debit notes? Notes with applications cannot be deleted.",
                action: bulkDeleteDebitNotesAction,
              },
            ]}
          />
        }
      />
    </div>
  );
}
