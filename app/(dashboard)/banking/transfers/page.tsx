import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Bank Transfers" };

const COLUMNS: ColumnDef[] = [
  { key: "date", header: "Date", sortable: true },
  { key: "description", header: "Description" },
  { key: "amount", header: "Amount", align: "right" },
];

export default async function BankTransfersPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  // Transfers are pairs of bank transactions with description starting with "Transfer ".
  // Show the credit leg only (one row per transfer).
  const where = {
    organizationId: organization.id,
    description: { startsWith: "Transfer " },
    type: "credit",
  } as const;

  const [total, rows] = await Promise.all([
    db.bankTransaction.count({ where }),
    db.bankTransaction.findMany({
      where, orderBy: { date: "desc" },
      skip: (page - 1) * pageSize, take: pageSize,
    }),
  ]);

  const dataRows = rows.map((t) => ({
    id: t.id,
    cells: [
      format(t.date, "dd MMM yyyy"),
      <span key="d">{t.description}</span>,
      formatMoney(Number(t.amount), organization.currency),
    ],
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <PageHeader title="Bank Transfers" ctaHref="/banking/transfers/new" ctaLabel="+ New Transfer" />
      {total === 0 ? (
        <EmptyState title="Move money between accounts" description="A transfer creates a debit on the source and a credit on the destination atomically." ctaHref="/banking/transfers/new" ctaLabel="+ New transfer" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} />
      )}
    </div>
  );
}
