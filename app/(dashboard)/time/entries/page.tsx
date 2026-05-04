import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";

export const metadata = { title: "Time Entries" };

const COLUMNS: ColumnDef[] = [
  { key: "date", header: "Date", sortable: true },
  { key: "project", header: "Project" },
  { key: "description", header: "Description" },
  { key: "hours", header: "Hours", align: "right" },
  { key: "billed", header: "Billed", align: "center" },
];

export default async function TimeEntriesPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const q = (searchParams.q ?? "").trim();
  const sort = ["date", "hours"].includes(searchParams.sort ?? "") ? searchParams.sort! : "date";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.TimeEntryWhereInput = {
    organizationId: organization.id,
    ...(q ? { description: { contains: q, mode: "insensitive" } } : {}),
  };

  const [total, rows] = await Promise.all([
    db.timeEntry.count({ where }),
    db.timeEntry.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize, include: { project: { select: { name: true } } } }),
  ]);

  const dataRows = rows.map((e) => ({
    id: e.id,
    cells: [
      format(e.date, "dd MMM yyyy"),
      <span key="p" className="font-medium">{e.project.name}</span>,
      e.description ?? <span className="text-muted-foreground">—</span>,
      Number(e.hours).toFixed(2),
      e.isBilled ? <Badge key="b" variant="success">Billed</Badge> : <span key="b" className="text-muted-foreground text-xs">Unbilled</span>,
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Time Entries" ctaHref="/time/entries/new" ctaLabel="+ Log Time" />
      {total === 0 && !q ? (
        <EmptyState title="Log time as you work" description="Track hours per project, billable or not, and roll them into invoices later." ctaHref="/time/entries/new" ctaLabel="+ Log your first entry" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
