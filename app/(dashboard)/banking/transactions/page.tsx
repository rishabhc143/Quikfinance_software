import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";
import { AccountFilter } from "./account-filter";

export const metadata = { title: "Bank Transactions" };

const COLUMNS: ColumnDef[] = [
  { key: "date", header: "Date", sortable: true },
  { key: "description", header: "Description" },
  { key: "account", header: "Account" },
  { key: "type", header: "Type" },
  { key: "amount", header: "Amount", sortable: true, align: "right" },
  { key: "reconciled", header: "Reconciled", align: "center" },
];

export default async function BankTransactionsPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const cur = organization.currency;
  const q = (searchParams.q ?? "").trim();
  const accountFilter = searchParams.account;
  const sort = ["date", "amount"].includes(searchParams.sort ?? "") ? searchParams.sort! : "date";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.BankTransactionWhereInput = {
    organizationId: organization.id,
    ...(accountFilter ? { bankAccountId: accountFilter } : {}),
    ...(q ? { OR: [{ description: { contains: q, mode: "insensitive" } }, { reference: { contains: q, mode: "insensitive" } }] } : {}),
  };

  const [total, rows, accounts] = await Promise.all([
    db.bankTransaction.count({ where }),
    db.bankTransaction.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize, include: { bankAccount: { select: { name: true } } } }),
    db.bankAccount.findMany({ where: { organizationId: organization.id, isActive: true }, select: { id: true, name: true } }),
  ]);

  const dataRows = rows.map((t) => ({
    id: t.id,
    cells: [
      format(t.date, "dd MMM yyyy"),
      <span key="d" className="font-medium">{t.description ?? "—"}</span>,
      <span key="a" className="text-muted-foreground">{t.bankAccount.name}</span>,
      <Badge key="ty" variant={t.type === "credit" ? "success" : "outline"}>{t.type === "credit" ? "+ in" : "− out"}</Badge>,
      formatMoney(Number(t.amount), cur),
      t.isReconciled ? <Badge key="r" variant="success">✓</Badge> : <span key="r" className="text-muted-foreground text-xs">No</span>,
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Bank Transactions" ctaHref="/banking/transactions/new" ctaLabel="+ New Transaction" />
      {accounts.length > 0 && <AccountFilter current={accountFilter ?? ""} accounts={accounts} />}
      {total === 0 && !q ? (
        <EmptyState title="No transactions" description="Record bank deposits and withdrawals manually, or import a statement file." ctaHref="/banking/transactions/new" ctaLabel="+ Add a transaction" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
