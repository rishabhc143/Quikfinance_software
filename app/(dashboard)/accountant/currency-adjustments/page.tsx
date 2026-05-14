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
import { formatMoney } from "@/lib/money";
import { currencyAdjustmentReference } from "@/lib/accounting/currency-adjustment";

export const metadata = { title: "Currency Adjustments" };

const COLUMNS: ColumnDef[] = [
  { key: "number", header: "Number", sortable: true },
  { key: "date", header: "Date", sortable: true },
  { key: "currency", header: "Currency" },
  { key: "net", header: "Net", align: "right" },
  { key: "notes", header: "Notes" },
];

/**
 * ACCT-C — Currency Adjustments list page. Hydrates each row's
 * net P&L impact from the linked CADJ:<id> JE so accountants can
 * scan recent revaluations without clicking through.
 */
export default async function CurrencyAdjustmentsPage({
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

  const where: Prisma.CurrencyAdjustmentWhereInput = {
    organizationId: organization.id,
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { currency: { contains: q, mode: "insensitive" } },
            { notes: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.currencyAdjustment.count({ where }),
    db.currencyAdjustment.findMany({
      where,
      orderBy: { [sort]: dir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // Hydrate net P&L per row by summing the FX-Gain / FX-Loss legs
  // of each CADJ:<id> JE in one go.
  const refs = rows.map((r) => currencyAdjustmentReference(r.id));
  const jes = refs.length
    ? await db.journalEntry.findMany({
        where: {
          organizationId: organization.id,
          reference: { in: refs },
        },
        include: {
          lines: {
            select: {
              debit: true,
              credit: true,
              account: { select: { code: true } },
            },
          },
        },
      })
    : [];
  const netByRef = new Map<string, number>();
  for (const je of jes) {
    if (!je.reference) continue;
    // Net P&L = Σ (gain credits) − Σ (loss debits).
    let net = 0;
    for (const l of je.lines) {
      if (l.account.code === "SYS-FX-GAIN") net += Number(l.credit);
      else if (l.account.code === "SYS-FX-LOSS") net -= Number(l.debit);
    }
    netByRef.set(je.reference, net);
  }

  const dataRows = rows.map((r) => {
    const net = netByRef.get(currencyAdjustmentReference(r.id)) ?? 0;
    return {
      id: r.id,
      cells: [
        <Link
          key="n"
          href={`/accountant/currency-adjustments/${r.id}`}
          className="font-mono text-primary hover:underline"
        >
          {r.number}
        </Link>,
        format(r.date, "dd MMM yyyy"),
        <Badge key="c" variant="outline" className="font-mono text-[10px]">
          {r.currency}
        </Badge>,
        <span
          key="a"
          className={
            "tabular-nums " +
            (net >= 0 ? "text-emerald-600" : "text-destructive")
          }
        >
          {net >= 0 ? "+" : "−"}
          {formatMoney(Math.abs(net), organization.currency)}
        </span>,
        <span
          key="o"
          className="text-muted-foreground truncate inline-block max-w-[200px]"
        >
          {r.notes ?? "—"}
        </span>,
      ],
    };
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <PageHeader
        title="Currency Adjustments"
        ctaHref="/accountant/currency-adjustments/new"
        ctaLabel="+ New Adjustment"
      />
      {total === 0 && !q ? (
        <EmptyState
          title="Forex revaluation"
          description="Post unrealised gains and losses on your foreign-currency balances at period end. Each adjustment generates a balanced journal entry against your FX Gain or FX Loss account."
          ctaHref="/accountant/currency-adjustments/new"
          ctaLabel="+ Post first adjustment"
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
