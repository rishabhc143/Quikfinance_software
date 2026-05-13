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
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Manual Journals" };

const COLUMNS: ColumnDef[] = [
  { key: "number", header: "Number", sortable: true },
  { key: "date", header: "Date", sortable: true },
  { key: "lines", header: "Lines" },
  { key: "amount", header: "Amount", align: "right" },
  { key: "notes", header: "Notes" },
];

/**
 * ACCT-A — Manual Journals list. Each row now shows the linked JE's
 * line count + total debit (the canonical journal amount). Rows are
 * clickable: number column links to the detail page.
 *
 * Pre-ACCT-A header-only rows (no linked JE) render with "0 lines · —"
 * so users can identify and clean them up.
 */
export default async function ManualJournalsPage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const { organization } = await requireOrganization();
  const q = (searchParams.q ?? "").trim();
  const sort = ["number", "date"].includes(searchParams.sort ?? "")
    ? searchParams.sort!
    : "date";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.ManualJournalWhereInput = {
    organizationId: organization.id,
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { notes: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.manualJournal.count({ where }),
    db.manualJournal.findMany({
      where,
      orderBy: { [sort]: dir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // Hydrate the linked JE totals in one query keyed by reference.
  const refs = rows.map((r) => `MJ:${r.id}`);
  const jes = refs.length
    ? await db.journalEntry.findMany({
        where: {
          organizationId: organization.id,
          reference: { in: refs },
        },
        select: {
          reference: true,
          lines: { select: { debit: true } },
        },
      })
    : [];
  const totalsByRef = new Map<string, { lineCount: number; totalDebit: number }>();
  for (const je of jes) {
    if (!je.reference) continue;
    totalsByRef.set(je.reference, {
      lineCount: je.lines.length,
      totalDebit: je.lines.reduce((s, l) => s + Number(l.debit), 0),
    });
  }

  const dataRows = rows.map((j) => {
    const totals = totalsByRef.get(`MJ:${j.id}`);
    return {
      id: j.id,
      cells: [
        <Link
          key="n"
          href={`/accountant/manual-journals/${j.id}`}
          className="font-mono text-primary hover:underline"
        >
          {j.number}
        </Link>,
        format(j.date, "dd MMM yyyy"),
        totals ? (
          <span key="l" className="text-xs">
            {totals.lineCount} lines
          </span>
        ) : (
          <span key="l" className="text-xs text-muted-foreground italic">
            Header only
          </span>
        ),
        <span key="a" className="tabular-nums">
          {totals
            ? formatMoney(totals.totalDebit, organization.currency)
            : "—"}
        </span>,
        <span
          key="o"
          className="text-muted-foreground truncate inline-block max-w-[260px]"
        >
          {j.notes ?? "—"}
        </span>,
      ],
    };
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <PageHeader
        title="Manual Journals"
        ctaHref="/accountant/manual-journals/new"
        ctaLabel="+ New Journal"
      />
      {total === 0 && !q ? (
        <EmptyState
          title="Adjustments and reclassifications"
          description="Manual journals let accountants post one-off balanced debit / credit corrections that aren't tied to invoices or bills."
          ctaHref="/accountant/manual-journals/new"
          ctaLabel="+ Create journal"
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
