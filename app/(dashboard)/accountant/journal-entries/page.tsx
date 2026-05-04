import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Journal Entries" };

const COLUMNS: ColumnDef[] = [
  { key: "date", header: "Date", sortable: true },
  { key: "reference", header: "Reference" },
  { key: "lines", header: "Lines" },
  { key: "amount", header: "Amount", align: "right" },
];

export default async function JournalEntriesPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const sort = "date";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const [total, rows] = await Promise.all([
    db.journalEntry.count({ where: { organizationId: organization.id } }),
    db.journalEntry.findMany({
      where: { organizationId: organization.id },
      orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize,
      include: { lines: true },
    }),
  ]);

  const dataRows = rows.map((j) => {
    const totalDebit = j.lines.reduce((s, l) => s + Number(l.debit), 0);
    return {
      id: j.id,
      cells: [
        format(j.date, "dd MMM yyyy"),
        j.reference ?? "—",
        `${j.lines.length} lines`,
        formatMoney(totalDebit, organization.currency),
      ],
    };
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <PageHeader title="Journal Entries" ctaHref="/accountant/journal-entries/new" ctaLabel="+ New Entry" />
      {total === 0 ? (
        <EmptyState title="Double-entry bookkeeping" description="Every transaction is a balanced set of debits and credits. Use this for adjustments not captured by invoices, bills, or expenses." ctaHref="/accountant/journal-entries/new" ctaLabel="+ Create entry" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} />
      )}
    </div>
  );
}
