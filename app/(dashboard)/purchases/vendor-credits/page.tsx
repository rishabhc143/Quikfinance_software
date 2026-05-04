import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Vendor Credits" };

const COLUMNS: ColumnDef[] = [
  { key: "number", header: "Number", sortable: true },
  { key: "vendor", header: "Vendor" },
  { key: "date", header: "Date", sortable: true },
  { key: "total", header: "Amount", sortable: true, align: "right" },
];

export default async function VendorCreditsPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const q = (searchParams.q ?? "").trim();
  const sort = ["number", "date", "total"].includes(searchParams.sort ?? "") ? searchParams.sort! : "date";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.VendorCreditWhereInput = {
    organizationId: organization.id,
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { contact: { displayName: { contains: q, mode: "insensitive" } } }] } : {}),
  };

  const [total, rows] = await Promise.all([
    db.vendorCredit.count({ where }),
    db.vendorCredit.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize, include: { contact: { select: { displayName: true } } } }),
  ]);

  const dataRows = rows.map((v) => ({
    id: v.id,
    cells: [
      <span key="n" className="font-mono">{v.number}</span>,
      v.contact.displayName,
      format(v.date, "dd MMM yyyy"),
      formatMoney(Number(v.total), organization.currency),
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Vendor Credits" ctaHref="/purchases/vendor-credits/new" ctaLabel="+ New Vendor Credit" />
      {total === 0 && !q ? (
        <EmptyState title="No vendor credits" description="Refunds or credit adjustments from vendors." ctaHref="/purchases/vendor-credits/new" ctaLabel="+ Create vendor credit" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
