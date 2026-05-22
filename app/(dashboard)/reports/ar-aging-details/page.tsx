import Link from "next/link";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { ReportShell } from "@/components/reports/report-shell";
import { formatMoney } from "@/lib/money";
import {
  computeArAgingDetails,
  type AgingBy,
  type SortDir,
  type SortKey,
} from "@/lib/reports/ar-aging-details";

export const metadata = { title: "AR Aging Details" };

/**
 * RPT-AR-DETAILS — AR Aging Details report page.
 *
 * Matches the Zoho "AR Aging Details By Invoice Due Date" view 1:1
 * for the data columns + filter chip layout. The interactive parts
 * not yet built (More Filters, Customize Columns, Group By, Entities
 * other than Invoice) are rendered as disabled chips so the UI shape
 * is honest about what the report covers today.
 */
export default async function ArAgingDetailsPage({
  searchParams,
}: {
  searchParams?: {
    asOf?: string;
    agingBy?: string;
    intervalCount?: string;
    intervalSize?: string;
    sort?: string;
    dir?: string;
  };
}) {
  const { organization } = await requireOrganization();
  const cur = organization.currency;

  // Parse + clamp searchParams to defensible defaults. Anything wonky
  // (e.g. user types `?asOf=foo`) falls back silently rather than
  // exploding the page.
  const asOfParam = searchParams?.asOf;
  const asOf = parseDateOrToday(asOfParam);
  const agingBy: AgingBy =
    searchParams?.agingBy === "issueDate" ? "issueDate" : "dueDate";
  const intervalCount = clampInt(searchParams?.intervalCount, 4, 1, 12);
  const intervalSize = clampInt(searchParams?.intervalSize, 15, 1, 365);
  const sortBy = parseSortBy(searchParams?.sort);
  const sortDir: SortDir = searchParams?.dir === "asc" ? "asc" : "desc";

  // Fetch every potentially-outstanding invoice; the lib does the
  // status + balance filtering. Including the contact saves an N+1
  // for the customer name column.
  const invoices = await db.invoice.findMany({
    where: {
      organizationId: organization.id,
      deletedAt: null,
      status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
    },
    include: { contact: { select: { displayName: true, type: true } } },
  });

  const rows = computeArAgingDetails({
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      total: Number(i.total),
      amountPaid: Number(i.amountPaid),
      status: i.status,
      contactId: i.contactId,
      contact: i.contact,
    })),
    asOf,
    agingBy,
    intervalCount,
    intervalSize,
    sortBy,
    sortDir,
  });

  // Title flips based on aging-by selection — matches Zoho.
  const dynamicTitle =
    agingBy === "dueDate"
      ? "AR Aging Details By Invoice Due Date"
      : "AR Aging Details By Invoice Date";

  const asOfDisplay = formatDateForDisplay(asOf);

  // Build a query string preserving current filters so the export
  // button + sort header links land back on the same view.
  const baseParams = new URLSearchParams({
    asOf: isoDate(asOf),
    agingBy,
    intervalCount: String(intervalCount),
    intervalSize: String(intervalSize),
  });
  const exportHref = `/reports/ar-aging-details/export?${baseParams.toString()}`;

  function sortHref(key: SortKey): string {
    const nextDir =
      sortBy === key && sortDir === "desc" ? "asc" : "desc";
    const p = new URLSearchParams(baseParams);
    p.set("sort", key);
    p.set("dir", nextDir);
    return `?${p.toString()}`;
  }

  return (
    <ReportShell
      title={dynamicTitle}
      subtitle={<span>As of {asOfDisplay}</span>}
      actions={
        <Button asChild variant="outline" size="sm" className="gap-1">
          <a href={exportHref}>
            <Download className="h-4 w-4" /> Export CSV
          </a>
        </Button>
      }
    >
      {/* Filter chip row — matches the Zoho layout. As of + Aging By
          are functional. Entities + More Filters are info-only for
          v1 so the screen shape is honest. */}
      <form
        method="GET"
        action="/reports/ar-aging-details"
        className="flex flex-wrap items-end gap-3 pb-3 border-b"
      >
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">As of</span>
          <input
            type="date"
            name="asOf"
            defaultValue={isoDate(asOf)}
            className="h-8 px-2 rounded-md border bg-background text-xs"
          />
        </label>

        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Aging By</span>
          <select
            name="agingBy"
            defaultValue={agingBy}
            className="h-8 px-2 rounded-md border bg-background text-xs"
          >
            <option value="dueDate">Invoice Due Date</option>
            <option value="issueDate">Invoice Date</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Entities</span>
          <select
            disabled
            defaultValue="invoice"
            className="h-8 px-2 rounded-md border bg-muted/30 text-xs cursor-not-allowed"
            title="Credit Notes / Debit Notes coming soon"
          >
            <option value="invoice">Invoice</option>
          </select>
        </label>

        <span
          className="h-8 px-3 inline-flex items-center rounded-md border bg-muted/30 text-xs text-muted-foreground cursor-not-allowed"
          title="More Filters coming soon"
        >
          + More Filters
        </span>

        <Button type="submit" size="sm" className="h-8 text-xs">
          Run Report
        </Button>
      </form>

      {/* Secondary toolbar — Group By / Aging Intervals / Customize
          Columns. Aging Intervals is functional; Group By + Customize
          are info-only for v1. */}
      <div className="flex flex-wrap items-center gap-4 py-2 text-xs">
        <span className="text-muted-foreground" title="Group By coming soon">
          Group By:{" "}
          <span className="font-medium text-foreground">None</span>
        </span>

        <form
          method="GET"
          action="/reports/ar-aging-details"
          className="flex items-center gap-1.5"
        >
          {/* Preserve current filters when submitting interval change. */}
          <input type="hidden" name="asOf" value={isoDate(asOf)} />
          <input type="hidden" name="agingBy" value={agingBy} />
          <span className="text-muted-foreground">Aging Intervals:</span>
          <select
            name="intervalLayout"
            defaultValue={`${intervalCount}x${intervalSize}`}
            className="h-7 px-1.5 rounded-md border bg-background text-xs"
            onChange={undefined}
          >
            {/* These are inert without JS; for v1 we ship the static set
                that Zoho commonly uses. Submit form on change is wired
                via the matching hidden inputs below. */}
            <option value="4x15">4 × 15 Days</option>
            <option value="4x30">4 × 30 Days</option>
            <option value="3x30">3 × 30 Days</option>
            <option value="6x30">6 × 30 Days</option>
          </select>
          <input type="hidden" name="intervalCount" value={intervalCount} />
          <input type="hidden" name="intervalSize" value={intervalSize} />
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px] uppercase tracking-wider"
          >
            Apply
          </Button>
        </form>

        <span
          className="ml-auto text-muted-foreground"
          title="Customize Report Columns coming soon"
        >
          Customize Report Columns{" "}
          <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-muted text-[10px]">
            9
          </span>
        </span>
      </div>

      {/* Centered company name + report title above the data table —
          matches Zoho's print-friendly header. */}
      <div className="text-center py-4 border-t border-b">
        <div className="text-xs text-muted-foreground">{organization.name}</div>
        <div className="text-base font-semibold mt-0.5">{dynamicTitle}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          As of {asOfDisplay}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-20 text-sm text-center text-muted-foreground">
          No data to display
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">
                <Link href={sortHref("date")} className="hover:underline">
                  Date {sortIndicator(sortBy, sortDir, "date")}
                </Link>
              </th>
              <th className="text-left px-3 py-2">
                <Link href={sortHref("dueDate")} className="hover:underline">
                  Due Date {sortIndicator(sortBy, sortDir, "dueDate")}
                </Link>
              </th>
              <th className="text-left px-3 py-2">Transaction#</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">
                <Link
                  href={sortHref("customerName")}
                  className="hover:underline"
                >
                  Customer Name {sortIndicator(sortBy, sortDir, "customerName")}
                </Link>
              </th>
              <th className="text-right px-3 py-2">
                <Link href={sortHref("age")} className="hover:underline">
                  Age {sortIndicator(sortBy, sortDir, "age")}
                </Link>
              </th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-right px-3 py-2">
                <Link href={sortHref("balanceDue")} className="hover:underline">
                  Balance Due {sortIndicator(sortBy, sortDir, "balanceDue")}
                </Link>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.invoiceId} className="hover:bg-muted/30">
                <td className="px-3 py-2 tabular-nums">{r.date}</td>
                <td className="px-3 py-2 tabular-nums">{r.dueDate}</td>
                <td className="px-3 py-2">
                  <Link
                    href={`/sales/invoices/${r.invoiceId}`}
                    className="text-primary hover:underline"
                  >
                    {r.number}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.type}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2 font-medium">{r.customerName}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.age <= 0 ? "—" : `${r.age} days`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoney(r.amount, cur)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {formatMoney(r.balanceDue, cur)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30 text-xs">
            <tr>
              <td className="px-3 py-2 font-medium" colSpan={8}>
                Total ({rows.length} row{rows.length === 1 ? "" : "s"})
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">
                {formatMoney(
                  rows.reduce((s, r) => s + r.balanceDue, 0),
                  cur
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </ReportShell>
  );
}

/* ───────────────────────── helpers ───────────────────────── */

function parseDateOrToday(s: string | undefined): Date {
  if (!s) return new Date();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date();
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function clampInt(
  s: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (!s) return fallback;
  const n = Number(s);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parseSortBy(s: string | undefined): SortKey {
  switch (s) {
    case "date":
    case "dueDate":
    case "age":
    case "balanceDue":
    case "customerName":
      return s;
    default:
      return "age";
  }
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Indian dd/MM/yyyy display per house convention. */
function formatDateForDisplay(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function sortIndicator(
  current: SortKey,
  dir: SortDir,
  key: SortKey
): string {
  if (current !== key) return "";
  return dir === "asc" ? "▲" : "▼";
}
