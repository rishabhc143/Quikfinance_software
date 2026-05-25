import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { ReportFilterStrip } from "@/components/reports/report-filter-strip";
import { AsOfDatePresetDropdown } from "@/components/reports/as-of-date-preset-dropdown";
import { ListReportTemplate } from "@/components/reports/list-report-template";
import {
  parseAsOfPreset,
  resolveAsOfPreset,
  type AsOfPresetKey,
} from "@/lib/reports/as-of-date-presets";
import { getRecentReportActivity } from "@/lib/reports/activity";
import { getExistingSchedule } from "@/lib/reports/scheduled";
import {
  buildReceivablesSummary,
  type ReceivablesSummaryRow,
} from "@/lib/reports/receivables-summary";
import type { ListReportColumn } from "@/lib/reports/list-report-helpers";
import type { CustomizeColumnDescriptor } from "@/components/reports/customize-report-drawer";

export const metadata = { title: "Receivables Summary" };

/**
 * RPT-RECV — Receivables Summary page.
 *
 * Lists every open invoice (status SENT / PARTIALLY_PAID / OVERDUE)
 * with a positive balance due as of the chosen date. Uses the new
 * shared `ListReportTemplate` — the page only does data fetching +
 * column descriptors; the template handles the table, filter strip,
 * empty state, totals row, and toolbar wiring.
 */

const COLUMN_DESCRIPTORS: CustomizeColumnDescriptor[] = [
  { key: "showCustomer", label: "Customer", defaultEnabled: true },
  { key: "showInvoiceNumber", label: "Invoice #", defaultEnabled: true },
  { key: "showIssueDate", label: "Invoice Date", defaultEnabled: true },
  { key: "showDueDate", label: "Due Date", defaultEnabled: true },
  { key: "showAge", label: "Age (days)", defaultEnabled: true },
  { key: "showTotal", label: "Total", defaultEnabled: true },
  { key: "showAmountPaid", label: "Amount Paid", defaultEnabled: false },
  { key: "showBalanceDue", label: "Balance Due", defaultEnabled: true },
];

function isVisible(
  searchParams: Record<string, string | undefined> | undefined,
  paramKey: string,
  defaultVisible: boolean,
): boolean {
  const v = searchParams?.[paramKey];
  if (v === undefined) return defaultVisible;
  return v !== "0";
}

export default async function ReceivablesSummaryPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const { organization, user } = await requireOrganization();

  // Parse As of Date preset (Item #2.7 pattern).
  const asOfPreset: AsOfPresetKey =
    parseAsOfPreset(searchParams?.asOfPreset) ??
    (searchParams?.asOf ? "custom" : "today");
  const asOf =
    asOfPreset === "custom"
      ? parseAsOf(searchParams?.asOf)
      : resolveAsOfPreset(asOfPreset, organization.fiscalYearStart);
  const asOfDisplay = format(asOf, "dd/MM/yyyy");

  // Column visibility (Customize drawer).
  const cols = {
    customer: isVisible(searchParams, "showCustomer", true),
    invoiceNumber: isVisible(searchParams, "showInvoiceNumber", true),
    issueDate: isVisible(searchParams, "showIssueDate", true),
    dueDate: isVisible(searchParams, "showDueDate", true),
    age: isVisible(searchParams, "showAge", true),
    total: isVisible(searchParams, "showTotal", true),
    amountPaid: isVisible(searchParams, "showAmountPaid", false),
    balanceDue: isVisible(searchParams, "showBalanceDue", true),
  };

  // Fetch open invoices + customer + parallel side-data.
  const [invoices, activityRows, existingSchedule] = await Promise.all([
    db.invoice.findMany({
      where: {
        organizationId: organization.id,
        deletedAt: null,
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        issueDate: { lte: asOf },
      },
      select: {
        id: true,
        number: true,
        issueDate: true,
        dueDate: true,
        total: true,
        amountPaid: true,
        status: true,
        contact: { select: { id: true, displayName: true } },
      },
    }),
    getRecentReportActivity(organization.id, "receivables-summary", 20),
    getExistingSchedule({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "receivables-summary",
    }),
  ]);

  const summary = buildReceivablesSummary(
    invoices.map((i) => ({
      id: i.id,
      number: i.number,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      total: Number(i.total),
      amountPaid: Number(i.amountPaid),
      status: i.status,
      contact: { id: i.contact.id, name: i.contact.displayName },
    })),
    asOf,
  );

  // Build dynamic columns based on visibility.
  const columns: ListReportColumn<ReceivablesSummaryRow>[] = [];
  if (cols.customer)
    columns.push({ key: "customerName", label: "Customer", type: "text" });
  if (cols.invoiceNumber)
    columns.push({ key: "invoiceNumber", label: "Invoice #", type: "text" });
  if (cols.issueDate)
    columns.push({ key: "issueDate", label: "Invoice Date", type: "date" });
  if (cols.dueDate)
    columns.push({ key: "dueDate", label: "Due Date", type: "date" });
  if (cols.age)
    columns.push({ key: "ageDays", label: "Age", type: "number" });
  if (cols.total)
    columns.push({ key: "total", label: "Total", type: "money" });
  if (cols.amountPaid)
    columns.push({ key: "amountPaid", label: "Amount Paid", type: "money" });
  if (cols.balanceDue)
    columns.push({ key: "balanceDue", label: "Balance Due", type: "money" });

  // Build export-link params (preserve current filters).
  const exportParams = new URLSearchParams();
  exportParams.set("asOf", format(asOf, "yyyy-MM-dd"));
  if (!cols.customer) exportParams.set("showCustomer", "0");
  if (!cols.invoiceNumber) exportParams.set("showInvoiceNumber", "0");
  if (!cols.issueDate) exportParams.set("showIssueDate", "0");
  if (!cols.dueDate) exportParams.set("showDueDate", "0");
  if (!cols.age) exportParams.set("showAge", "0");
  if (!cols.total) exportParams.set("showTotal", "0");
  if (cols.amountPaid) exportParams.set("showAmountPaid", "1");
  if (!cols.balanceDue) exportParams.set("showBalanceDue", "0");

  return (
    <ListReportTemplate<ReceivablesSummaryRow>
      reportKey="receivables-summary"
      title="Receivables Summary"
      subtitle={
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Sales</span>
          <span className="text-muted-foreground">•</span>
          <span>As of {asOfDisplay}</span>
        </span>
      }
      filterStrip={
        <ReportFilterStrip>
          <AsOfDatePresetDropdown
            defaultPreset={asOfPreset}
            defaultAsOf={asOf}
            fiscalYearStartMonth={organization.fiscalYearStart}
          />
        </ReportFilterStrip>
      }
      toolbar={{
        fiscalYearStartMonth: organization.fiscalYearStart,
        exportBaseUrl: "/reports/receivables-summary/export",
        exportParams: exportParams.toString(),
        customizableColumns: COLUMN_DESCRIPTORS,
        activityRows,
        existingSchedule,
      }}
      columns={columns}
      rows={summary.rows}
      totals={{
        balanceDue: summary.totalOutstanding,
        ...(cols.total ? { total: summary.rows.reduce((s, r) => s + r.total, 0) } : {}),
        ...(cols.amountPaid
          ? {
              amountPaid: summary.rows.reduce((s, r) => s + r.amountPaid, 0),
            }
          : {}),
      }}
      emptyMessage="No outstanding receivables — every invoice is paid."
      currency={organization.currency}
      footnote={
        <>
          **Amount is displayed in your base currency{" "}
          <span className="inline-block ml-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium text-[10px]">
            {organization.currency}
          </span>
        </>
      }
    />
  );
}

/* ───────────────────────── helpers ───────────────────────── */

function parseAsOf(s: string | undefined): Date {
  if (!s) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return new Date();
  const d = new Date(`${s}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
