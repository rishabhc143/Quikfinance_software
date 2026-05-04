import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Quotes" };

const COLUMNS: ColumnDef[] = [
  { key: "number", header: "Number", sortable: true },
  { key: "contactName", header: "Customer" },
  { key: "status", header: "Status" },
  { key: "issueDate", header: "Issued", sortable: true },
  { key: "expiryDate", header: "Expires" },
  { key: "total", header: "Total", sortable: true, align: "right" },
];

export default async function QuotesPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const q = (searchParams.q ?? "").trim();
  const sort = ["number", "issueDate", "total"].includes(searchParams.sort ?? "") ? searchParams.sort! : "issueDate";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.QuoteWhereInput = {
    organizationId: organization.id,
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { contact: { displayName: { contains: q, mode: "insensitive" } } }] } : {}),
  };

  const [total, rows] = await Promise.all([
    db.quote.count({ where }),
    db.quote.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize, include: { contact: { select: { displayName: true } } } }),
  ]);

  const dataRows = rows.map((q) => ({
    id: q.id,
    href: `/sales/quotes/${q.id}`,
    cells: [
      <span key="n" className="font-mono">{q.number}</span>,
      q.contact.displayName,
      <Badge key="s" variant="outline">{q.status}</Badge>,
      format(q.issueDate, "dd MMM yyyy"),
      q.expiryDate ? format(q.expiryDate, "dd MMM yyyy") : "—",
      formatMoney(Number(q.total), organization.currency),
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Quotes" ctaHref="/sales/quotes/new" ctaLabel="+ New Quote" />
      {total === 0 && !q ? (
        <EmptyState title="No quotes yet" description="Send a quote, get it accepted, then convert to invoice." ctaHref="/sales/quotes/new" ctaLabel="+ Create your first quote" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
