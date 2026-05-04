import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";

export const metadata = { title: "Delivery Challans" };

const COLUMNS: ColumnDef[] = [
  { key: "number", header: "Number", sortable: true },
  { key: "customer", header: "Customer" },
  { key: "status", header: "Status" },
  { key: "date", header: "Date", sortable: true },
];

export default async function DeliveryChallansPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const q = (searchParams.q ?? "").trim();
  const sort = ["number", "date"].includes(searchParams.sort ?? "") ? searchParams.sort! : "date";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.DeliveryChallanWhereInput = {
    organizationId: organization.id,
    ...(q ? { number: { contains: q, mode: "insensitive" } } : {}),
  };

  const [total, rows] = await Promise.all([
    db.deliveryChallan.count({ where }),
    db.deliveryChallan.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize, include: { contact: { select: { displayName: true } } } }),
  ]);

  const dataRows = rows.map((d) => ({
    id: d.id,
    cells: [
      <span key="n" className="font-mono">{d.number}</span>,
      d.contact?.displayName ?? "—",
      <Badge key="s" variant="outline">{d.status}</Badge>,
      format(d.date, "dd MMM yyyy"),
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Delivery Challans" ctaHref="/sales/delivery-challans/new" ctaLabel="+ New Challan" />
      {total === 0 && !q ? (
        <EmptyState title="No delivery challans" description="Goods-in-transit documents that aren't invoices yet." ctaHref="/sales/delivery-challans/new" ctaLabel="+ Create challan" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
