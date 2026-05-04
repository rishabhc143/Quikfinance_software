import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Other Income" };

const COLUMNS: ColumnDef[] = [
  { key: "date", header: "Date", sortable: true },
  { key: "description", header: "Description" },
  { key: "account", header: "Account" },
  { key: "amount", header: "Amount", align: "right" },
];

export default async function OtherIncomePage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;
  const where = { organizationId: organization.id, description: { startsWith: "Other income" } } as const;
  const [total, rows] = await Promise.all([
    db.bankTransaction.count({ where }),
    db.bankTransaction.findMany({ where, orderBy: { date: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { bankAccount: { select: { name: true } } } }),
  ]);
  const dataRows = rows.map((t) => ({ id: t.id, cells: [format(t.date, "dd MMM yyyy"), t.description, t.bankAccount.name, formatMoney(Number(t.amount), organization.currency)] }));
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <PageHeader title="Other Income" ctaHref="/banking/other-income/new" ctaLabel="+ New Income" />
      {total === 0 ? (
        <EmptyState title="Income not tied to an invoice" description="Interest, refunds, grants, miscellaneous receipts. Recorded directly to a bank account." ctaHref="/banking/other-income/new" ctaLabel="+ Record income" />
      ) : <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} />}
    </div>
  );
}
