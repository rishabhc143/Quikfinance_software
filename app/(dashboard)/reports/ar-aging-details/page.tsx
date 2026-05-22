import * as React from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { ReportShell } from "@/components/reports/report-shell";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import type { CustomizeColumnDescriptor } from "@/components/reports/customize-report-drawer";
import { getRecentReportActivity } from "@/lib/reports/activity";
import { getExistingSchedule } from "@/lib/reports/scheduled";
import { formatMoney } from "@/lib/money";
import {
  computeArAgingDetails,
  groupArAgingDetails,
  bucketLabels,
  type AgingBy,
  type ArAgingDetailRow,
  type Entity,
  type GroupBy,
  type SortDir,
  type SortKey,
} from "@/lib/reports/ar-aging-details";
import type { InvoiceStatus } from "@prisma/client";
import { AgingIntervalsSelect } from "@/components/reports/aging-intervals-select";
import { GroupBySelect } from "@/components/reports/group-by-select";
import { EntitiesPopover } from "@/components/reports/entities-popover";
import { MoreFiltersPopover } from "@/components/reports/more-filters-popover";

/**
 * DOC-AR-DETAILS: column descriptors for the shared Customize Report
 * drawer. Each column is on by default; users can hide via
 * `?show<Col>=0` in the URL (the drawer manages this).
 */
const COLUMN_DESCRIPTORS: CustomizeColumnDescriptor[] = [
  { key: "showDate", label: "Date", defaultEnabled: true },
  { key: "showDueDate", label: "Due Date", defaultEnabled: true },
  { key: "showNumber", label: "Transaction#", defaultEnabled: true },
  { key: "showType", label: "Type", defaultEnabled: true },
  { key: "showStatus", label: "Status", defaultEnabled: true },
  { key: "showCustomerName", label: "Customer Name", defaultEnabled: true },
  { key: "showAge", label: "Age", defaultEnabled: true },
  { key: "showAmount", label: "Amount", defaultEnabled: true },
  { key: "showBalanceDue", label: "Balance Due", defaultEnabled: true },
];

/** Map a column key from the API ("date") to its `show<X>` URL param. */
const COL_PARAM_BY_KEY: Record<string, string> = {
  date: "showDate",
  dueDate: "showDueDate",
  number: "showNumber",
  type: "showType",
  status: "showStatus",
  customerName: "showCustomerName",
  age: "showAge",
  amount: "showAmount",
  balanceDue: "showBalanceDue",
};

const ALL_COLUMN_KEYS = Object.keys(COL_PARAM_BY_KEY);

export const metadata = { title: "AR Aging Details" };

/**
 * RPT-AR-DETAILS — AR Aging Details report page (v2).
 *
 * v2 wires up all the filter / customization features that v1 shipped
 * as info-only chips: More Filters, Customize Columns, Group By,
 * Entities (Credit Notes), and the Aging Intervals dropdown auto-submits.
 */
export default async function ArAgingDetailsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const { organization, user } = await requireOrganization();
  const cur = organization.currency;

  const asOf = parseDateOrToday(searchParams?.asOf);
  const agingBy: AgingBy =
    searchParams?.agingBy === "issueDate" ? "issueDate" : "dueDate";
  const intervalCount = clampInt(searchParams?.intervalCount, 4, 1, 12);
  const intervalSize = clampInt(searchParams?.intervalSize, 15, 1, 365);
  const sortBy = parseSortBy(searchParams?.sort);
  const sortDir: SortDir = searchParams?.dir === "asc" ? "asc" : "desc";
  const groupBy = parseGroupBy(searchParams?.groupBy);
  const entities = parseEntities(searchParams?.entities);
  // DOC-AR-DETAILS: Column visibility now flows through the shared
  // Customize Report drawer. Each column has a `show<X>` URL param
  // (e.g. ?showAmount=0 hides Amount). Default = all visible.
  const cols = ALL_COLUMN_KEYS.filter((key) => {
    const paramKey = COL_PARAM_BY_KEY[key];
    const value = paramKey ? searchParams?.[paramKey] : undefined;
    return value !== "0";
  });
  const statusFilterArr = parseStatuses(searchParams?.statuses);
  const customerId = searchParams?.customerId?.trim() || undefined;
  const amountMin =
    searchParams?.amountMin && searchParams.amountMin.trim()
      ? Number(searchParams.amountMin)
      : undefined;
  const amountMax =
    searchParams?.amountMax && searchParams.amountMax.trim()
      ? Number(searchParams.amountMax)
      : undefined;
  const bucketFilter = parseBuckets(searchParams?.buckets);

  // Fetch invoices + credit notes + customers in parallel. The lib
  // filters on `entities` after the query so we always pull both
  // (cheap on small SMB datasets, and the type narrowing is cleaner).
  const [invoices, creditNotes, allCustomers, activityRows, existingSchedule] =
    await Promise.all([
      db.invoice.findMany({
        where: {
          organizationId: organization.id,
          deletedAt: null,
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        },
        include: { contact: { select: { displayName: true, type: true } } },
      }),
      db.creditNote.findMany({
        where: {
          organizationId: organization.id,
          deletedAt: null,
          status: "OPEN",
        },
        include: { contact: { select: { displayName: true } } },
      }),
      db.contact.findMany({
        where: {
          organizationId: organization.id,
          type: "CUSTOMER",
          deletedAt: null,
        },
        select: { id: true, displayName: true },
        orderBy: { displayName: "asc" },
        take: 500,
      }),
      // DOC-AR-DETAILS: Pre-fetch shared toolbar data so the Activity
      // and Schedule drawers open instantly without a client round-trip.
      getRecentReportActivity(organization.id, "ar-aging-details", 20),
      getExistingSchedule({
        organizationId: organization.id,
        userId: user.id,
        reportKey: "ar-aging-details",
      }),
    ]);

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
    creditNotes: creditNotes.map((c) => ({
      id: c.id,
      number: c.number,
      date: c.date,
      total: Number(c.total),
      amountApplied: Number(c.amountApplied),
      amountRefunded: Number(c.amountRefunded),
      status: c.status,
      contactId: c.contactId,
      contact: c.contact,
    })),
    asOf,
    agingBy,
    intervalCount,
    intervalSize,
    entities,
    statusFilter: statusFilterArr,
    customerId,
    amountMin,
    amountMax,
    bucketFilter,
    sortBy,
    sortDir,
  });

  const bucketsForOrdering = bucketLabels(intervalCount, intervalSize);
  const groups = groupArAgingDetails(rows, groupBy, bucketsForOrdering);

  const customerName = customerId
    ? allCustomers.find((c) => c.id === customerId)?.displayName ?? ""
    : "";

  const dynamicTitle =
    agingBy === "dueDate"
      ? "AR Aging Details By Invoice Due Date"
      : "AR Aging Details By Invoice Date";

  const asOfDisplay = formatDateForDisplay(asOf);

  // Build a query string preserving current filters for the export
  // links + sortable header links.
  const baseParams = new URLSearchParams();
  baseParams.set("asOf", isoDate(asOf));
  baseParams.set("agingBy", agingBy);
  baseParams.set("intervalCount", String(intervalCount));
  baseParams.set("intervalSize", String(intervalSize));
  if (groupBy !== "none") baseParams.set("groupBy", groupBy);
  if (entities.join(",") !== "invoice")
    baseParams.set("entities", entities.join(","));
  if (statusFilterArr) baseParams.set("statuses", statusFilterArr.join(","));
  if (customerId) baseParams.set("customerId", customerId);
  if (amountMin != null) baseParams.set("amountMin", String(amountMin));
  if (amountMax != null) baseParams.set("amountMax", String(amountMax));
  if (bucketFilter) baseParams.set("buckets", bucketFilter.join(","));
  // DOC-AR-DETAILS: column visibility lives in individual show<X>=0
  // URL params managed by the shared Customize Report drawer.
  // Preserve any that are currently hidden so the export URL matches.
  for (const key of ALL_COLUMN_KEYS) {
    const paramKey = COL_PARAM_BY_KEY[key];
    const value = paramKey ? searchParams?.[paramKey] : undefined;
    if (value === "0") baseParams.set(paramKey, "0");
  }

  // ReportToolbar builds its own export URLs from exportBaseUrl +
  // exportParams; we just hand over the preserved params.

  function sortHref(key: SortKey): string {
    const nextDir = sortBy === key && sortDir === "desc" ? "asc" : "desc";
    const p = new URLSearchParams(baseParams);
    p.set("sort", key);
    p.set("dir", nextDir);
    return `?${p.toString()}`;
  }

  const grandTotal = rows.reduce((s, r) => s + r.balanceDue, 0);

  return (
    <ReportShell
      title={dynamicTitle}
      subtitle={<span>As of {asOfDisplay}</span>}
      actions={
        <ReportToolbar
          reportKey="ar-aging-details"
          reportTitle="AR Aging Details"
          fiscalYearStartMonth={organization.fiscalYearStart}
          exportBaseUrl="/reports/ar-aging-details/export"
          exportParams={baseParams.toString()}
          columns={COLUMN_DESCRIPTORS}
          activityRows={activityRows}
          existingSchedule={existingSchedule}
        />
      }
    >
      {/* Filter chip row */}
      <form
        method="GET"
        action="/reports/ar-aging-details"
        className="flex flex-wrap items-end gap-3 pb-3 border-b"
      >
        {/* Preserve secondary filters via hidden inputs on Run Report */}
        {groupBy !== "none" ? (
          <input type="hidden" name="groupBy" value={groupBy} />
        ) : null}
        {entities.join(",") !== "invoice" ? (
          <input type="hidden" name="entities" value={entities.join(",")} />
        ) : null}
        {statusFilterArr ? (
          <input type="hidden" name="statuses" value={statusFilterArr.join(",")} />
        ) : null}
        {customerId ? (
          <input type="hidden" name="customerId" value={customerId} />
        ) : null}
        {amountMin != null ? (
          <input type="hidden" name="amountMin" value={String(amountMin)} />
        ) : null}
        {amountMax != null ? (
          <input type="hidden" name="amountMax" value={String(amountMax)} />
        ) : null}
        {bucketFilter ? (
          <input type="hidden" name="buckets" value={bucketFilter.join(",")} />
        ) : null}
        {/* Preserve hidden columns through the Run Report form */}
        {ALL_COLUMN_KEYS.map((key) => {
          const paramKey = COL_PARAM_BY_KEY[key];
          const value = paramKey ? searchParams?.[paramKey] : undefined;
          return value === "0" ? (
            <input
              key={paramKey}
              type="hidden"
              name={paramKey}
              value="0"
            />
          ) : null;
        })}
        <input type="hidden" name="intervalCount" value={intervalCount} />
        <input type="hidden" name="intervalSize" value={intervalSize} />

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

        <EntitiesPopover entities={entities} />

        <MoreFiltersPopover
          statuses={statusFilterArr ?? ["SENT", "PARTIALLY_PAID", "OVERDUE"]}
          customerId={customerId ?? ""}
          customerName={customerName}
          amountMin={amountMin != null ? String(amountMin) : ""}
          amountMax={amountMax != null ? String(amountMax) : ""}
          buckets={bucketFilter ?? []}
          bucketOptions={bucketsForOrdering}
          customerOptions={allCustomers}
        />

        <Button type="submit" size="sm" className="h-8 text-xs">
          Run Report
        </Button>
      </form>

      {/* Secondary toolbar */}
      <div className="flex flex-wrap items-center gap-4 py-2 text-xs">
        <GroupBySelect groupBy={groupBy} />
        <AgingIntervalsSelect
          intervalCount={intervalCount}
          intervalSize={intervalSize}
        />
        {/* DOC-AR-DETAILS: Column visibility is now handled by the
            shared Customize Report drawer (toolbar button at the top
            right of ReportShell). The old in-page CustomizeColumns
            popover was removed in #245. */}
      </div>

      {/* Centered company name + report title header */}
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
              {cols.includes("date") ? (
                <th className="text-left px-3 py-2">
                  <Link href={sortHref("date")} className="hover:underline">
                    Date {sortIndicator(sortBy, sortDir, "date")}
                  </Link>
                </th>
              ) : null}
              {cols.includes("dueDate") ? (
                <th className="text-left px-3 py-2">
                  <Link href={sortHref("dueDate")} className="hover:underline">
                    Due Date {sortIndicator(sortBy, sortDir, "dueDate")}
                  </Link>
                </th>
              ) : null}
              {cols.includes("number") ? (
                <th className="text-left px-3 py-2">Transaction#</th>
              ) : null}
              {cols.includes("type") ? (
                <th className="text-left px-3 py-2">Type</th>
              ) : null}
              {cols.includes("status") ? (
                <th className="text-left px-3 py-2">Status</th>
              ) : null}
              {cols.includes("customerName") ? (
                <th className="text-left px-3 py-2">
                  <Link href={sortHref("customerName")} className="hover:underline">
                    Customer Name {sortIndicator(sortBy, sortDir, "customerName")}
                  </Link>
                </th>
              ) : null}
              {cols.includes("age") ? (
                <th className="text-right px-3 py-2">
                  <Link href={sortHref("age")} className="hover:underline">
                    Age {sortIndicator(sortBy, sortDir, "age")}
                  </Link>
                </th>
              ) : null}
              {cols.includes("amount") ? (
                <th className="text-right px-3 py-2">Amount</th>
              ) : null}
              {cols.includes("balanceDue") ? (
                <th className="text-right px-3 py-2">
                  <Link href={sortHref("balanceDue")} className="hover:underline">
                    Balance Due {sortIndicator(sortBy, sortDir, "balanceDue")}
                  </Link>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {groupBy === "none"
              ? renderRows(groups[0].rows, cols, cur)
              : groups.map((g) => (
                  <React.Fragment key={g.groupKey}>
                    <tr className="bg-muted/50">
                      <td
                        colSpan={cols.length}
                        className="px-3 py-1.5 font-semibold text-xs"
                      >
                        {g.groupLabel}
                      </td>
                    </tr>
                    {renderRows(g.rows, cols, cur)}
                    <tr className="bg-muted/20 border-t">
                      <td
                        colSpan={cols.length - 1}
                        className="px-3 py-1.5 text-right text-xs font-semibold"
                      >
                        Subtotal — {g.groupLabel}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                        {formatMoney(g.subtotal, cur)}
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
          </tbody>
          <tfoot className="bg-muted/30 text-xs">
            <tr>
              <td
                className="px-3 py-2 font-medium"
                colSpan={Math.max(1, cols.length - 1)}
              >
                Total ({rows.length} row{rows.length === 1 ? "" : "s"})
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">
                {formatMoney(grandTotal, cur)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </ReportShell>
  );
}

/* ───────────────────────── row rendering ───────────────────────── */

function renderRows(
  rows: ArAgingDetailRow[],
  cols: string[],
  cur: string
) {
  return rows.map((r) => (
    <tr key={r.rowId} className="hover:bg-muted/30">
      {cols.includes("date") ? (
        <td className="px-3 py-2 tabular-nums">{r.date}</td>
      ) : null}
      {cols.includes("dueDate") ? (
        <td className="px-3 py-2 tabular-nums">{r.dueDate}</td>
      ) : null}
      {cols.includes("number") ? (
        <td className="px-3 py-2">
          <Link
            href={
              r.source === "creditnote"
                ? `/sales/credit-notes/${r.rowId}`
                : `/sales/invoices/${r.rowId}`
            }
            className="text-primary hover:underline"
          >
            {r.number}
          </Link>
        </td>
      ) : null}
      {cols.includes("type") ? <td className="px-3 py-2">{r.type}</td> : null}
      {cols.includes("status") ? (
        <td className="px-3 py-2">{r.status}</td>
      ) : null}
      {cols.includes("customerName") ? (
        <td className="px-3 py-2 font-medium">{r.customerName}</td>
      ) : null}
      {cols.includes("age") ? (
        <td className="px-3 py-2 text-right tabular-nums">
          {r.age <= 0 ? "—" : `${r.age} days`}
        </td>
      ) : null}
      {cols.includes("amount") ? (
        <td className="px-3 py-2 text-right tabular-nums">
          {formatMoney(r.amount, cur)}
        </td>
      ) : null}
      {cols.includes("balanceDue") ? (
        <td
          className={
            "px-3 py-2 text-right tabular-nums font-semibold " +
            (r.balanceDue < 0 ? "text-emerald-700" : "")
          }
        >
          {formatMoney(r.balanceDue, cur)}
        </td>
      ) : null}
    </tr>
  ));
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

function parseGroupBy(s: string | undefined): GroupBy {
  if (s === "customer" || s === "bucket" || s === "status") return s;
  return "none";
}

function parseEntities(s: string | undefined): Entity[] {
  if (!s) return ["invoice"];
  const parts = s
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x === "invoice" || x === "creditnote") as Entity[];
  return parts.length === 0 ? ["invoice"] : parts;
}

const VALID_STATUSES: ReadonlyArray<InvoiceStatus> = [
  "SENT",
  "PARTIALLY_PAID",
  "OVERDUE",
];

function parseStatuses(s: string | undefined): InvoiceStatus[] | undefined {
  if (!s) return undefined;
  const parts = s.split(",").map((x) => x.trim()) as InvoiceStatus[];
  const filtered = parts.filter((x) => VALID_STATUSES.includes(x));
  return filtered.length > 0 ? filtered : undefined;
}

function parseBuckets(s: string | undefined): string[] | undefined {
  if (!s) return undefined;
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
