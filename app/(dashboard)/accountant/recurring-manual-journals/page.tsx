import Link from "next/link";
import { format } from "date-fns";
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

export const metadata = { title: "Recurring Manual Journals" };

const COLUMNS: ColumnDef[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "freq", header: "Frequency" },
  { key: "next", header: "Next on" },
  { key: "occurrences", header: "Generated", align: "right" },
  { key: "status", header: "Status" },
];

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  ACTIVE: "secondary",
  PAUSED: "outline",
  EXPIRED: "outline",
  STOPPED: "outline",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  EXPIRED: "Expired",
  STOPPED: "Stopped",
};

function frequencyLabel(freq: string, intervalN: number): string {
  const base =
    freq.charAt(0).toUpperCase() + freq.slice(1).toLowerCase();
  if (intervalN <= 1) return base;
  return `Every ${intervalN} ${base.toLowerCase()}s`;
}

/**
 * ACCT-A.4.c — Recurring Manual Journals list. Soft-deleted rows
 * (`deletedAt` not null) are filtered out.
 */
export default async function RecurringManualJournalsPage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const { organization } = await requireOrganization();
  const q = (searchParams.q ?? "").trim();
  const sort = ["name", "next"].includes(searchParams.sort ?? "")
    ? searchParams.sort!
    : "next";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "asc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.RecurringManualJournalWhereInput = {
    organizationId: organization.id,
    deletedAt: null,
    ...(q
      ? { profileName: { contains: q, mode: "insensitive" } }
      : {}),
  };

  const orderBy: Prisma.RecurringManualJournalOrderByWithRelationInput =
    sort === "name"
      ? { profileName: dir }
      : { nextOccurrenceDate: dir };

  const [total, rows] = await Promise.all([
    db.recurringManualJournal.count({ where }),
    db.recurringManualJournal.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const dataRows = rows.map((r) => ({
    id: r.id,
    cells: [
      <Link
        key="n"
        href={`/accountant/recurring-manual-journals/${r.id}`}
        className="font-medium text-primary hover:underline"
      >
        {r.profileName}
      </Link>,
      <span key="f" className="text-xs">
        {frequencyLabel(r.frequency, r.intervalN)}
      </span>,
      <span key="x" className="text-xs">
        {format(r.nextOccurrenceDate, "dd MMM yyyy")}
      </span>,
      <span key="o" className="tabular-nums">
        {r.occurrencesGenerated}
      </span>,
      <Badge
        key="s"
        variant={STATUS_VARIANT[r.status] ?? "outline"}
        className="text-[10px]"
      >
        {STATUS_LABEL[r.status] ?? r.status}
      </Badge>,
    ],
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <PageHeader
        title="Recurring Manual Journals"
        ctaHref="/accountant/recurring-manual-journals/new"
        ctaLabel="+ New Recurring Profile"
      />
      {total === 0 && !q ? (
        <EmptyState
          title="Automate periodic journals"
          description="Set up a template for recurring entries like monthly depreciation or quarterly accruals. Each occurrence is generated as a DRAFT so you can review before publishing."
          ctaHref="/accountant/recurring-manual-journals/new"
          ctaLabel="+ Create profile"
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
