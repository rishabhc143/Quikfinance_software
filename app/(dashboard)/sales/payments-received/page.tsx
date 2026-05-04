import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Payments Received" };

const COLUMNS: ColumnDef[] = [
  { key: "number", header: "Number", sortable: true },
  { key: "contact", header: "Customer" },
  { key: "paymentDate", header: "Date", sortable: true },
  { key: "method", header: "Method" },
  { key: "amount", header: "Amount", sortable: true, align: "right" },
  { key: "applied", header: "Applied to" },
];

export default async function PaymentsReceivedPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const cur = organization.currency;
  const q = (searchParams.q ?? "").trim();
  const sort = ["paymentDate", "amount", "number"].includes(searchParams.sort ?? "") ? searchParams.sort! : "paymentDate";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.PaymentReceivedWhereInput = {
    organizationId: organization.id,
    ...(q ? { OR: [
      { number: { contains: q, mode: "insensitive" } },
      { contact: { displayName: { contains: q, mode: "insensitive" } } },
      { reference: { contains: q, mode: "insensitive" } },
    ] } : {}),
  };

  const [total, rows] = await Promise.all([
    db.paymentReceived.count({ where }),
    db.paymentReceived.findMany({
      where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize,
      include: { contact: { select: { displayName: true } }, allocations: { include: { invoice: { select: { number: true } } } } },
    }),
  ]);

  const dataRows = rows.map((p) => ({
    id: p.id,
    href: `/sales/payments-received/${p.id}`,
    cells: [
      <span key="n" className="font-mono">{p.number}</span>,
      p.contact.displayName,
      format(p.paymentDate, "dd MMM yyyy"),
      p.method ? <Badge key="m" variant="outline">{p.method}</Badge> : "—",
      formatMoney(Number(p.amount), cur),
      <span key="a" className="text-xs text-muted-foreground">
        {p.allocations.length === 1 ? p.allocations[0].invoice.number : `${p.allocations.length} invoices`}
      </span>,
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Payments Received" ctaHref="/sales/payments-received/new" ctaLabel="+ Record Payment" />
      {total === 0 && !q ? (
        <EmptyState
          title="Record customer payments"
          description="Money in from customers, allocated against one or more open invoices. Updates AR balances automatically."
          ctaHref="/sales/payments-received/new"
          ctaLabel="+ Record your first payment"
        />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
