import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";

export const metadata = { title: "Manual Journals" };

const COLUMNS: ColumnDef[] = [
  { key: "number", header: "Number", sortable: true },
  { key: "date", header: "Date", sortable: true },
  { key: "notes", header: "Notes" },
];

export default async function ManualJournalsPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const q = (searchParams.q ?? "").trim();
  const sort = ["number", "date"].includes(searchParams.sort ?? "") ? searchParams.sort! : "date";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.ManualJournalWhereInput = {
    organizationId: organization.id,
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { notes: { contains: q, mode: "insensitive" } }] } : {}),
  };

  const [total, rows] = await Promise.all([
    db.manualJournal.count({ where }),
    db.manualJournal.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);

  const dataRows = rows.map((j) => ({
    id: j.id,
    cells: [
      <span key="n" className="font-mono">{j.number}</span>,
      format(j.date, "dd MMM yyyy"),
      <span key="o" className="text-muted-foreground truncate inline-block max-w-[300px]">{j.notes ?? "—"}</span>,
    ],
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <PageHeader title="Manual Journals" ctaHref="/accountant/manual-journals/new" ctaLabel="+ New Journal" />
      {total === 0 && !q ? (
        <EmptyState title="Adjustments and reclassifications" description="Manual journals let accountants post one-off corrections that aren't tied to invoices or bills." ctaHref="/accountant/manual-journals/new" ctaLabel="+ Create journal" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
