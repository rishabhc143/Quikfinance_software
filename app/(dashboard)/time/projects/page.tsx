import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Projects" };

const COLUMNS: ColumnDef[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "customer", header: "Customer" },
  { key: "status", header: "Status" },
  { key: "budget", header: "Budget", align: "right" },
  { key: "startDate", header: "Start" },
  { key: "endDate", header: "End" },
];

export default async function ProjectsPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const cur = organization.currency;
  const q = (searchParams.q ?? "").trim();
  const sort = ["name", "startDate", "createdAt"].includes(searchParams.sort ?? "") ? searchParams.sort! : "name";
  const dir: "asc" | "desc" = searchParams.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.ProjectWhereInput = {
    organizationId: organization.id,
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };

  const [total, rows] = await Promise.all([
    db.project.count({ where }),
    db.project.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);

  const customerIds = Array.from(new Set(rows.map((r) => r.customerId).filter(Boolean) as string[]));
  const customers = customerIds.length > 0
    ? await db.contact.findMany({ where: { id: { in: customerIds } }, select: { id: true, displayName: true } })
    : [];
  const customerMap = new Map(customers.map((c) => [c.id, c.displayName]));

  const dataRows = rows.map((p) => ({
    id: p.id,
    href: `/time/projects/${p.id}`,
    cells: [
      <span key="n" className="font-medium">{p.name}</span>,
      p.customerId ? customerMap.get(p.customerId) ?? "—" : "—",
      <Badge key="s" variant={p.status === "active" ? "success" : "outline"}>{p.status.replace("_", " ")}</Badge>,
      p.budget ? formatMoney(Number(p.budget), cur) : "—",
      p.startDate ? format(p.startDate, "dd MMM yyyy") : "—",
      p.endDate ? format(p.endDate, "dd MMM yyyy") : "—",
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Projects" ctaHref="/time/projects/new" ctaLabel="+ New Project" />
      {total === 0 && !q ? (
        <EmptyState title="Track work by project" description="Group time entries, track budgets, and bill customers per project." ctaHref="/time/projects/new" ctaLabel="+ Create your first project" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
