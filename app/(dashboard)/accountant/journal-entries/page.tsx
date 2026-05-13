import Link from "next/link";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
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
import { parseJeReference } from "@/lib/accounting/parse-je-reference";

export const metadata = { title: "Journal Entries" };

const COLUMNS: ColumnDef[] = [
  { key: "date", header: "Date", sortable: true },
  { key: "source", header: "Source" },
  { key: "reference", header: "Reference" },
  { key: "lines", header: "Lines" },
  { key: "amount", header: "Amount", align: "right" },
];

type SourceFilter = "all" | "auto" | "manual";

function filterFromSearch(s: string | undefined): SourceFilter {
  return s === "auto" || s === "manual" ? s : "all";
}

/**
 * RPT-C — Journal Entries list, now source-aware. Every JE has a
 * structured `reference` written by the BNK-D/E and RPT-B post-helpers
 * (see docs/accounting-architecture.md §3); this page parses it into
 * a friendly source label + a link to the originating record so users
 * can audit "where did this entry come from?".
 *
 * The filter pills above the table let users narrow to:
 *   - Auto-created (parser matches the reference — structured key)
 *   - Manual (free-text reference or empty)
 *   - All (default)
 *
 * Filtering happens at query time via `reference: { startsWith: ... }`
 * checks for the auto path and `NOT` for manual.
 */
export default async function JournalEntriesPage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const { organization } = await requireOrganization();
  const sort = "date";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;
  const source = filterFromSearch(searchParams.source);

  // BNK-D/E + RPT-B prefixes that mark an auto-created JE.
  const AUTO_PREFIXES = [
    "INV-SENT:",
    "INV-PMT:",
    "INV-WRITEOFF:",
    "BILL-OPEN:",
    "BILL-PMT:",
    "BILL-PMT-ADV:",
    "BILL-WRITEOFF:",
    "CN-OPEN:",
    "CN-REFUND:",
    "VC-OPEN:",
    "VC-REFUND:",
    "VA-CREATE:",
  ];

  const sourceWhere =
    source === "auto"
      ? { OR: AUTO_PREFIXES.map((p) => ({ reference: { startsWith: p } })) }
      : source === "manual"
        ? {
            AND: AUTO_PREFIXES.map((p) => ({
              NOT: { reference: { startsWith: p } },
            })),
          }
        : {};

  const where = { organizationId: organization.id, ...sourceWhere };

  const [total, totalAll, totalAuto, totalManual, rows] = await Promise.all([
    db.journalEntry.count({ where }),
    db.journalEntry.count({
      where: { organizationId: organization.id },
    }),
    db.journalEntry.count({
      where: {
        organizationId: organization.id,
        OR: AUTO_PREFIXES.map((p) => ({ reference: { startsWith: p } })),
      },
    }),
    db.journalEntry.count({
      where: {
        organizationId: organization.id,
        AND: AUTO_PREFIXES.map((p) => ({
          NOT: { reference: { startsWith: p } },
        })),
      },
    }),
    db.journalEntry.findMany({
      where,
      orderBy: { [sort]: dir },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { lines: true },
    }),
  ]);

  const dataRows = rows.map((j) => {
    const totalDebit = j.lines.reduce((s, l) => s + Number(l.debit), 0);
    const parsed = parseJeReference(j.reference);
    return {
      id: j.id,
      cells: [
        format(j.date, "dd MMM yyyy"),
        parsed ? (
          parsed.sourceHref ? (
            <Link
              key="src"
              href={parsed.sourceHref}
              className="inline-flex items-center gap-1 text-primary hover:underline"
              title={`Go to source: ${parsed.sourceId}`}
            >
              <Badge variant="secondary" className="text-[10px]">
                {parsed.label}
              </Badge>
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : (
            <Badge key="src" variant="secondary" className="text-[10px]">
              {parsed.label}
            </Badge>
          )
        ) : (
          <Badge key="src" variant="outline" className="text-[10px]">
            Manual
          </Badge>
        ),
        <span key="ref" className="font-mono text-xs text-muted-foreground">
          {j.reference ?? "—"}
        </span>,
        `${j.lines.length} lines`,
        formatMoney(totalDebit, organization.currency),
      ],
    };
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <PageHeader
        title="Journal Entries"
        ctaHref="/accountant/journal-entries/new"
        ctaLabel="+ New Entry"
      />

      {/* Source filter pills */}
      <div className="flex items-center gap-1 text-xs">
        <FilterPill
          href="/accountant/journal-entries"
          label={`All (${totalAll})`}
          active={source === "all"}
        />
        <FilterPill
          href="/accountant/journal-entries?source=auto"
          label={`Auto-created (${totalAuto})`}
          active={source === "auto"}
        />
        <FilterPill
          href="/accountant/journal-entries?source=manual"
          label={`Manual (${totalManual})`}
          active={source === "manual"}
        />
      </div>

      {total === 0 ? (
        <EmptyState
          title={
            source === "auto"
              ? "No auto-created entries"
              : source === "manual"
                ? "No manual entries"
                : "Double-entry bookkeeping"
          }
          description={
            source === "auto"
              ? "Auto-created entries appear here when you send an invoice, open a bill, categorise a bank line, or fire a transaction rule."
              : source === "manual"
                ? "Manual entries appear here when you post adjustments directly from the New Entry form."
                : "Every transaction is a balanced set of debits and credits. Use this for adjustments not captured by invoices, bills, or expenses."
          }
          ctaHref="/accountant/journal-entries/new"
          ctaLabel="+ Create entry"
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
        />
      )}
    </div>
  );
}

function FilterPill({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "px-2.5 py-1 rounded-md border transition-colors " +
        (active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-transparent hover:bg-muted/60 text-muted-foreground hover:text-foreground")
      }
    >
      {label}
    </Link>
  );
}
