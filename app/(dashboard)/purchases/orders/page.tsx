import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Purchase Orders" };

const COLUMNS: ColumnDef[] = [
  { key: "number", header: "Number", sortable: true },
  { key: "vendor", header: "Vendor" },
  { key: "status", header: "Status" },
  { key: "orderDate", header: "Date", sortable: true },
  { key: "total", header: "Total", sortable: true, align: "right" },
];

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const q = (searchParams.q ?? "").trim();
  const sort = ["number", "orderDate", "total"].includes(searchParams.sort ?? "") ? searchParams.sort! : "orderDate";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.PurchaseOrderWhereInput = {
    organizationId: organization.id,
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { contact: { displayName: { contains: q, mode: "insensitive" } } }] } : {}),
  };

  const [total, rows] = await Promise.all([
    db.purchaseOrder.count({ where }),
    db.purchaseOrder.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize, include: { contact: { select: { displayName: true } } } }),
  ]);

  const dataRows = rows.map((p) => ({
    id: p.id,
    cells: [
      <span key="n" className="font-mono">{p.number}</span>,
      p.contact.displayName,
      <Badge key="s" variant="outline">{p.status}</Badge>,
      format(p.orderDate, "dd MMM yyyy"),
      formatMoney(Number(p.total), organization.currency),
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Purchase Orders" ctaHref="/purchases/orders/new" ctaLabel="+ New Purchase Order" />
      {total === 0 && !q ? (
        <EmptyState title="No purchase orders yet" description="Pre-purchase commitments to vendors before bills arrive." ctaHref="/purchases/orders/new" ctaLabel="+ Create first PO" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
