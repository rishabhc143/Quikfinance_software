import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  DataTable,
  PageHeader,
  EmptyState,
  type ColumnDef,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import {
  fiscalYearLabel,
  isBudgetPeriod,
  type BudgetPeriod,
} from "@/lib/accounting/budgets";

export const metadata = { title: "Budgets" };

const COLUMNS: ColumnDef[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "year", header: "Fiscal Year" },
  { key: "period", header: "Period" },
  { key: "accounts", header: "Accounts", align: "right" },
  { key: "annual", header: "Annual Total", align: "right" },
  { key: "status", header: "Status" },
];

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

const PERIOD_LABEL: Record<BudgetPeriod, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

/**
 * ACCT-D — Budgets list page. Hydrates the annual total + account
 * count by summing BudgetLine amounts grouped by parent budget so
 * the table can scan quickly.
 */
export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const { organization } = await requireOrganization();
  const q = (searchParams.q ?? "").trim();
  const sort = ["name", "year"].includes(searchParams.sort ?? "")
    ? searchParams.sort!
    : "year";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.BudgetWhereInput = {
    organizationId: organization.id,
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };

  const orderBy: Prisma.BudgetOrderByWithRelationInput =
    sort === "name" ? { name: dir } : { fiscalYear: dir };

  const [total, rows] = await Promise.all([
    db.budget.count({ where }),
    db.budget.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        lines: { select: { accountId: true, amount: true } },
      },
    }),
  ]);

  const dataRows = rows.map((r) => {
    // N rows per account (12 / 4 / 1 by period); account count = distinct accountId.
    const accountIds = new Set(r.lines.map((l) => l.accountId));
    const annual = r.lines.reduce((s, l) => s + Number(l.amount), 0);
    const period: BudgetPeriod = isBudgetPeriod(r.budgetPeriod)
      ? r.budgetPeriod
      : "MONTHLY";
    return {
      id: r.id,
      cells: [
        <Link
          key="n"
          href={`/accountant/budgets/${r.id}`}
          className="font-medium text-primary hover:underline"
        >
          {r.name}
        </Link>,
        <span key="y" className="font-mono text-xs text-muted-foreground">
          {fiscalYearLabel(r.fiscalYear, organization.fiscalYearStart, "short")}
        </span>,
        <span key="p" className="text-xs">
          {PERIOD_LABEL[period]}
        </span>,
        <span key="c" className="tabular-nums">
          {accountIds.size}
        </span>,
        <span key="a" className="tabular-nums font-medium">
          {formatMoney(annual, organization.currency)}
        </span>,
        <Badge
          key="s"
          variant={r.status === "ACTIVE" ? "secondary" : "outline"}
          className="text-[10px]"
        >
          {STATUS_LABEL[r.status] ?? r.status}
        </Badge>,
      ],
    };
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <PageHeader
        title="Budgets"
        ctaHref="/accountant/budgets/new"
        ctaLabel="+ New Budget"
      />
      {total === 0 && !q ? (
        <EmptyState
          title="Plan vs reality"
          description="Set annual P&L targets per account, then track how the ledger is performing against them. Budget vs Actuals appears on the detail page."
          ctaHref="/accountant/budgets/new"
          ctaLabel="+ Create your first budget"
        />
      ) : (
        <DataTable
          rows={dataRows}
          columns={COLUMNS}
          total={total}
          page={page}
          pageSize={pageSize}
          sort={sort}
          dir={dir}
          search={q}
        />
      )}
    </div>
  );
}
