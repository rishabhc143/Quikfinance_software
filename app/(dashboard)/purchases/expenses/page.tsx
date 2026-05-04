import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Expenses" };

const COLUMNS: ColumnDef[] = [
  { key: "date", header: "Date", sortable: true },
  { key: "category", header: "Category", sortable: true },
  { key: "vendor", header: "Vendor" },
  { key: "reference", header: "Reference" },
  { key: "amount", header: "Amount", sortable: true, align: "right" },
];

export default async function ExpensesPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const cur = organization.currency;
  const q = (searchParams.q ?? "").trim();
  const sort = ["date", "category", "amount"].includes(searchParams.sort ?? "") ? searchParams.sort! : "date";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.ExpenseWhereInput = {
    organizationId: organization.id,
    ...(q ? { OR: [{ category: { contains: q, mode: "insensitive" } }, { reference: { contains: q, mode: "insensitive" } }] } : {}),
  };

  const [total, rows] = await Promise.all([
    db.expense.count({ where }),
    db.expense.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize, include: { contact: { select: { displayName: true } } } }),
  ]);

  const dataRows = rows.map((e) => ({
    id: e.id,
    href: `/purchases/expenses/${e.id}/edit`,
    cells: [
      format(e.date, "dd MMM yyyy"),
      <span key="cat" className="font-medium">{e.category}</span>,
      e.contact?.displayName ?? "—",
      e.reference ?? "—",
      formatMoney(Number(e.amount), cur),
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Expenses" ctaHref="/purchases/expenses/new" ctaLabel="+ Record Expense" />
      {total === 0 && !q ? (
        <EmptyState title="Track every expense" description="Office supplies, subscriptions, travel — record once and they roll up across reports." ctaHref="/purchases/expenses/new" ctaLabel="+ Record your first expense" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
