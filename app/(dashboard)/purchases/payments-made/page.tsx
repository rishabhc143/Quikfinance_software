import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Payments Made" };

const COLUMNS: ColumnDef[] = [
  { key: "number", header: "Number", sortable: true },
  { key: "contact", header: "Vendor" },
  { key: "paymentDate", header: "Date", sortable: true },
  { key: "method", header: "Method" },
  { key: "amount", header: "Amount", sortable: true, align: "right" },
  { key: "applied", header: "Applied to" },
];

export default async function PaymentsMadePage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const cur = organization.currency;
  const q = (searchParams.q ?? "").trim();
  const sort = ["paymentDate", "amount", "number"].includes(searchParams.sort ?? "") ? searchParams.sort! : "paymentDate";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.PaymentMadeWhereInput = {
    organizationId: organization.id,
    ...(q ? { OR: [
      { number: { contains: q, mode: "insensitive" } },
      { contact: { displayName: { contains: q, mode: "insensitive" } } },
      { reference: { contains: q, mode: "insensitive" } },
    ] } : {}),
  };

  const [total, rows] = await Promise.all([
    db.paymentMade.count({ where }),
    db.paymentMade.findMany({
      where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize,
      include: { contact: { select: { displayName: true } }, allocations: { include: { bill: { select: { number: true } } } } },
    }),
  ]);

  const dataRows = rows.map((p) => ({
    id: p.id,
    href: `/purchases/payments-made/${p.id}`,
    cells: [
      <span key="n" className="font-mono">{p.number}</span>,
      p.contact.displayName,
      format(p.paymentDate, "dd MMM yyyy"),
      p.method ? <Badge key="m" variant="outline">{p.method}</Badge> : "—",
      formatMoney(Number(p.amount), cur),
      <span key="a" className="text-xs text-muted-foreground">
        {p.allocations.length === 1 ? p.allocations[0].bill.number : `${p.allocations.length} bills`}
      </span>,
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Payments Made" ctaHref="/purchases/payments-made/new" ctaLabel="+ Record Payment" />
      {total === 0 && !q ? (
        <EmptyState title="Record vendor payments" description="Money out to vendors, allocated against one or more open bills. Updates AP balances automatically." ctaHref="/purchases/payments-made/new" ctaLabel="+ Record your first payment" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
