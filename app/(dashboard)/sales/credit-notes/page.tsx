import Link from "next/link";
import { format } from "date-fns";
import { ReceiptText, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
        <Badge key="s" variant="outline">{c.status}</Badge>,
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
    <div className="space-y-4">
      <ReceiptText className="h-12 w-12 mx-auto text-primary" aria-hidden />
      <h2 className="text-xl font-semibold">No credit notes yet.</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Issue a credit note when a customer is owed a refund or a price
        adjustment after the original invoice.
      </p>
      <Button asChild>
        <Link href="/sales/credit-notes/new" className="gap-1">
          <Plus className="h-4 w-4" /> Create Credit Note
        </Link>
      </Button>
    </div>
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
