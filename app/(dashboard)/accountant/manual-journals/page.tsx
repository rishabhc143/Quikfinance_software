import Link from "next/link";
import { Download, Upload } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Manual Journals" };

const COLUMNS: ColumnDef[] = [
  { key: "number", header: "Number", sortable: true },
  { key: "date", header: "Date", sortable: true },
  { key: "status", header: "Status" },
  { key: "ref", header: "Ref#" },
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

  // Explicit `select` so the list page only depends on the
  // columns it actually renders. Without this, Prisma's default
  // SELECT-all generates a query against every column declared
  // in schema.prisma — and a missing column in prod (forgotten
  // migration) tanks the whole page rather than just hiding a
  // not-yet-shipped feature. See plan: hotfix Manual Journals.
  const [total, rows] = await Promise.all([
    db.manualJournal.count({ where }),
    db.manualJournal.findMany({
      where,
      orderBy: { [sort]: dir },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true,
        date: true,
        status: true,
        referenceNumber: true,
        notes: true,
        currency: true,
      },
    }),
  ]);

  // Hydrate totals: PUBLISHED rows pull from JournalEntryLine
  // (the canonical ledger), DRAFT rows pull from ManualJournalLine
  // (the editable source). Either way we render lineCount + totalDebit.
  const publishedRefs = rows
    .filter((r) => r.status === "PUBLISHED")
    .map((r) => `MJ:${r.id}`);
  const draftIds = rows.filter((r) => r.status !== "PUBLISHED").map((r) => r.id);

  const [jes, draftLines] = await Promise.all([
    publishedRefs.length
      ? db.journalEntry.findMany({
          where: {
            organizationId: organization.id,
            reference: { in: publishedRefs },
          },
          select: {
            reference: true,
            lines: { select: { debit: true } },
          },
        })
      : Promise.resolve([]),
    draftIds.length
      ? db.manualJournalLine.findMany({
          where: { manualJournalId: { in: draftIds } },
          select: { manualJournalId: true, debit: true },
        })
      : Promise.resolve([]),
  ]);

  const totalsByMjId = new Map<string, { lineCount: number; totalDebit: number }>();
  for (const je of jes) {
    if (!je.reference) continue;
    const mjId = je.reference.slice("MJ:".length);
    totalsByMjId.set(mjId, {
      lineCount: je.lines.length,
      totalDebit: je.lines.reduce((s, l) => s + Number(l.debit), 0),
    });
  }
  for (const l of draftLines) {
    const cur = totalsByMjId.get(l.manualJournalId) ?? {
      lineCount: 0,
      totalDebit: 0,
    };
    totalsByMjId.set(l.manualJournalId, {
      lineCount: cur.lineCount + 1,
      totalDebit: cur.totalDebit + Number(l.debit),
    });
  }

  const dataRows = rows.map((j) => {
    const totals = totalsByMjId.get(j.id);
    const displayCurrency = j.currency ?? organization.currency;
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
        <Badge
          key="s"
          variant={j.status === "PUBLISHED" ? "secondary" : "outline"}
          className="text-[10px]"
        >
          {j.status === "PUBLISHED" ? "Published" : "Draft"}
        </Badge>,
        <span key="r" className="font-mono text-xs text-muted-foreground">
          {j.referenceNumber ?? "—"}
        </span>,
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
          {totals ? formatMoney(totals.totalDebit, displayCurrency) : "—"}
        </span>,
        <span
          key="o"
          className="text-muted-foreground truncate inline-block max-w-[200px]"
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
      >
        {/* ACCT-A.4.b — Bulk Import wizard. Lands on the upload
            step; everything created is a DRAFT for safety. */}
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link href="/accountant/manual-journals/import">
            <Upload className="h-4 w-4" /> Import
          </Link>
        </Button>
        {/* ACCT-A.4.a — Export carries the current search query so
            what you see in the table is what you get in the CSV.
            Defaults to the last 90 days, all statuses. */}
        <Button asChild variant="outline" size="sm" className="gap-1">
          <a
            href={`/accountant/manual-journals/export${q ? `?q=${encodeURIComponent(q)}` : ""}`}
          >
            <Download className="h-4 w-4" /> Export
          </a>
        </Button>
      </PageHeader>
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
