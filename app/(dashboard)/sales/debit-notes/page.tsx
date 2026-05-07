import Link from "next/link";
import { format } from "date-fns";
import { FileMinus, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TransactionListPage } from "@/components/shared/transaction-list-page";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Debit Notes" };

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
      <Badge key="s" variant="outline">
        {d.status}
      </Badge>,
      <span key="t" className="text-right tabular-nums">
        {formatMoney(Number(d.total), d.currency)}
      </span>,
    ],
  }));

  const empty = (
    <div className="space-y-4">
      <FileMinus className="h-12 w-12 mx-auto text-primary" aria-hidden />
      <h2 className="text-xl font-semibold">No debit notes yet.</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Import existing debit notes from a CSV, or add them via the
        Invoice Refinement workflow.
      </p>
      <Button asChild>
        <Link href="/sales/debit-notes/import" className="gap-1">
          <Plus className="h-4 w-4" /> Import Debit Notes
        </Link>
      </Button>
    </div>
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Debit Notes"
        view="All debit notes"
        importHref="/sales/debit-notes/import"
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
      />
    </div>
  );
}
