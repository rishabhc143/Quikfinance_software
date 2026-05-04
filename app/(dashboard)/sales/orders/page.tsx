import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Sales Orders" };

const COLUMNS: ColumnDef[] = [
  { key: "number", header: "Number", sortable: true },
  { key: "customer", header: "Customer" },
  { key: "status", header: "Status" },
  { key: "orderDate", header: "Date", sortable: true },
  { key: "total", header: "Total", sortable: true, align: "right" },
];

export default async function SalesOrdersPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const q = (searchParams.q ?? "").trim();
  const sort = ["number", "orderDate", "total"].includes(searchParams.sort ?? "") ? searchParams.sort! : "orderDate";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.SalesOrderWhereInput = {
    organizationId: organization.id,
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { contact: { displayName: { contains: q, mode: "insensitive" } } }] } : {}),
  };

  const [total, rows] = await Promise.all([
    db.salesOrder.count({ where }),
    db.salesOrder.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize, include: { contact: { select: { displayName: true } } } }),
  ]);

  const dataRows = rows.map((s) => ({
    id: s.id,
    cells: [
      <span key="n" className="font-mono">{s.number}</span>,
      s.contact.displayName,
      <Badge key="s" variant="outline">{s.status}</Badge>,
      format(s.orderDate, "dd MMM yyyy"),
      formatMoney(Number(s.total), organization.currency),
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Sales Orders" ctaHref="/sales/orders/new" ctaLabel="+ New Sales Order" />
      {total === 0 && !q ? (
        <EmptyState title="No sales orders yet" description="Confirm a customer order before it becomes an invoice. Useful for fulfillment workflows." ctaHref="/sales/orders/new" ctaLabel="+ Create your first sales order" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
