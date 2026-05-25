import { format, parse, isValid } from "date-fns";
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
  buildCustomerBalanceSummary,
  type CustomerBalanceRow,
} from "@/lib/reports/customer-balance-summary";
import type { ListReportColumn } from "@/lib/reports/list-report-helpers";
import type { CustomizeColumnDescriptor } from "@/components/reports/customize-report-drawer";

export const metadata = { title: "Customer Balance Summary" };

/**
 * RPT-CBS — Customer Balance Summary page.
 *
 * Per-customer collections view as of a chosen date. Columns match
 * Zoho: Customer Name / Invoiced Amount / Amount Received / Closing
 * Balance. Filter: As of Date + optional "exclude zero balance".
 */

const COLUMN_DESCRIPTORS: CustomizeColumnDescriptor[] = [
  { key: "showCustomer", label: "Customer Name", defaultEnabled: true },
  { key: "showInvoiced", label: "Invoiced Amount", defaultEnabled: true },
  { key: "showReceived", label: "Amount Received", defaultEnabled: true },
  { key: "showBalance", label: "Closing Balance", defaultEnabled: true },
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

export default async function CustomerBalanceSummaryPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const { organization, user } = await requireOrganization();

  // As of Date preset
  const asOfPreset: AsOfPresetKey =
    parseAsOfPreset(searchParams?.asOfPreset) ??
    (searchParams?.asOf ? "custom" : "today");
  const asOf =
    asOfPreset === "custom"
      ? parseAsOf(searchParams?.asOf)
      : resolveAsOfPreset(asOfPreset, organization.fiscalYearStart);
  const asOfDisplay = format(asOf, "dd/MM/yyyy");

  const cols = {
    customer: isVisible(searchParams, "showCustomer", true),
    invoiced: isVisible(searchParams, "showInvoiced", true),
    received: isVisible(searchParams, "showReceived", true),
    balance: isVisible(searchParams, "showBalance", true),
  };

  const excludeZero = searchParams?.excludeZeroBalance === "1";

  const [invoices, activityRows, existingSchedule] = await Promise.all([
    db.invoice.findMany({
      where: {
        organizationId: organization.id,
        deletedAt: null,
        issueDate: { lte: asOf },
      },
      select: {
        contactId: true,
        total: true,
        amountPaid: true,
        status: true,
        contact: { select: { id: true, displayName: true } },
      },
    }),
    getRecentReportActivity(organization.id, "customer-balance-summary", 20),
    getExistingSchedule({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "customer-balance-summary",
    }),
  ]);

  const summary = buildCustomerBalanceSummary(
    invoices.map((i) => ({
      contactId: i.contactId,
      total: Number(i.total),
      amountPaid: Number(i.amountPaid),
      status: i.status,
      contact: { id: i.contact.id, name: i.contact.displayName },
    })),
    { excludeZeroBalance: excludeZero },
  );

  const columns: ListReportColumn<CustomerBalanceRow>[] = [];
  if (cols.customer)
    columns.push({ key: "customerName", label: "Customer Name", type: "text" });
  if (cols.invoiced)
    columns.push({ key: "invoicedAmount", label: "Invoiced Amount", type: "money" });
  if (cols.received)
    columns.push({ key: "amountReceived", label: "Amount Received", type: "money" });
  if (cols.balance)
    columns.push({ key: "closingBalance", label: "Closing Balance", type: "money" });

  const exportParams = new URLSearchParams();
  exportParams.set("asOf", format(asOf, "yyyy-MM-dd"));
  if (excludeZero) exportParams.set("excludeZeroBalance", "1");
  if (!cols.customer) exportParams.set("showCustomer", "0");
  if (!cols.invoiced) exportParams.set("showInvoiced", "0");
  if (!cols.received) exportParams.set("showReceived", "0");
  if (!cols.balance) exportParams.set("showBalance", "0");

  return (
    <ListReportTemplate<CustomerBalanceRow>
      reportKey="customer-balance-summary"
      title="Customer Balance Summary"
      subtitle={
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Receivables</span>
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
          {/* "Exclude zero balance" filter — Zoho-parity toggle. */}
          <label className="inline-flex items-center gap-2 px-3 h-9 rounded-md border border-input bg-background text-sm">
            <input
              type="checkbox"
              name="excludeZeroBalance"
              value="1"
              defaultChecked={excludeZero}
              className="h-4 w-4"
            />
            <span className="text-muted-foreground">Exclude zero balance</span>
          </label>
        </ReportFilterStrip>
      }
      toolbar={{
        fiscalYearStartMonth: organization.fiscalYearStart,
        exportBaseUrl: "/reports/customer-balance-summary/export",
        exportParams: exportParams.toString(),
        customizableColumns: COLUMN_DESCRIPTORS,
        activityRows,
        existingSchedule,
      }}
      columns={columns}
      rows={summary.rows}
      totals={{
        invoicedAmount: summary.totalInvoiced,
        amountReceived: summary.totalReceived,
        closingBalance: summary.totalBalance,
      }}
      emptyMessage="No customer balances to show — all invoices are settled or no invoices exist."
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
  const d = parse(s, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : new Date();
}
