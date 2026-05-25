import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { ReportFilterStrip } from "@/components/reports/report-filter-strip";
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { ListReportTemplate } from "@/components/reports/list-report-template";
import { parseRangeFromSearchParams } from "@/lib/reports/date-range";
import { getRecentReportActivity } from "@/lib/reports/activity";
import { getExistingSchedule } from "@/lib/reports/scheduled";
import {
  buildSalesByCustomer,
  type SalesByCustomerRow,
} from "@/lib/reports/sales-by-customer";
import type { ListReportColumn } from "@/lib/reports/list-report-helpers";
import type { CustomizeColumnDescriptor } from "@/components/reports/customize-report-drawer";

export const metadata = { title: "Sales by Customer" };

/**
 * RPT-SBC — Sales by Customer page.
 *
 * Aggregates invoices by customer for the chosen date range. Most-valuable
 * customer at top (sorted by gross sales descending).
 */

const COLUMN_DESCRIPTORS: CustomizeColumnDescriptor[] = [
  { key: "showCustomer", label: "Customer", defaultEnabled: true },
  { key: "showInvoiceCount", label: "Invoices", defaultEnabled: true },
  { key: "showGross", label: "Gross Sales", defaultEnabled: true },
  { key: "showPaid", label: "Amount Paid", defaultEnabled: true },
  { key: "showBalance", label: "Balance Due", defaultEnabled: true },
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

export default async function SalesByCustomerPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const { organization, user } = await requireOrganization();

  const { range, preset } = parseRangeFromSearchParams(searchParams ?? {}, {
    fiscalYearStartMonth: organization.fiscalYearStart,
    defaultPreset: "this-month",
  });

  const cols = {
    customer: isVisible(searchParams, "showCustomer", true),
    invoiceCount: isVisible(searchParams, "showInvoiceCount", true),
    gross: isVisible(searchParams, "showGross", true),
    paid: isVisible(searchParams, "showPaid", true),
    balance: isVisible(searchParams, "showBalance", true),
  };

  const [invoices, activityRows, existingSchedule] = await Promise.all([
    db.invoice.findMany({
      where: {
        organizationId: organization.id,
        deletedAt: null,
        issueDate: { gte: range.start, lte: range.end },
      },
      select: {
        id: true,
        contactId: true,
        total: true,
        amountPaid: true,
        status: true,
        contact: { select: { id: true, displayName: true } },
      },
    }),
    getRecentReportActivity(organization.id, "sales-by-customer", 20),
    getExistingSchedule({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "sales-by-customer",
    }),
  ]);

  const summary = buildSalesByCustomer(
    invoices.map((i) => ({
      id: i.id,
      contactId: i.contactId,
      total: Number(i.total),
      amountPaid: Number(i.amountPaid),
      status: i.status,
      contact: { id: i.contact.id, name: i.contact.displayName },
    })),
  );

  const columns: ListReportColumn<SalesByCustomerRow>[] = [];
  if (cols.customer)
    columns.push({ key: "customerName", label: "Customer", type: "text" });
  if (cols.invoiceCount)
    columns.push({ key: "invoiceCount", label: "Invoices", type: "number" });
  if (cols.gross)
    columns.push({ key: "grossSales", label: "Gross Sales", type: "money" });
  if (cols.paid)
    columns.push({ key: "amountPaid", label: "Amount Paid", type: "money" });
  if (cols.balance)
    columns.push({ key: "balanceDue", label: "Balance Due", type: "money" });

  const exportParams = new URLSearchParams();
  exportParams.set("preset", preset);
  if (preset === "custom") {
    exportParams.set("from", format(range.start, "yyyy-MM-dd"));
    exportParams.set("to", format(range.end, "yyyy-MM-dd"));
  }
  if (!cols.customer) exportParams.set("showCustomer", "0");
  if (!cols.invoiceCount) exportParams.set("showInvoiceCount", "0");
  if (!cols.gross) exportParams.set("showGross", "0");
  if (!cols.paid) exportParams.set("showPaid", "0");
  if (!cols.balance) exportParams.set("showBalance", "0");

  const rangeLabel = `${format(range.start, "dd/MM/yyyy")} — ${format(range.end, "dd/MM/yyyy")}`;

  return (
    <ListReportTemplate<SalesByCustomerRow>
      reportKey="sales-by-customer"
      title="Sales by Customer"
      subtitle={
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Sales</span>
          <span className="text-muted-foreground">•</span>
          <span>{rangeLabel}</span>
        </span>
      }
      filterStrip={
        <ReportFilterStrip>
          <DateRangePicker
            activePreset={preset}
            activeRange={range}
            fiscalYearStartMonth={organization.fiscalYearStart}
          />
        </ReportFilterStrip>
      }
      toolbar={{
        fiscalYearStartMonth: organization.fiscalYearStart,
        exportBaseUrl: "/reports/sales-by-customer/export",
        exportParams: exportParams.toString(),
        customizableColumns: COLUMN_DESCRIPTORS,
        activityRows,
        existingSchedule,
      }}
      columns={columns}
      rows={summary.rows}
      totals={{
        grossSales: summary.totalGross,
        amountPaid: summary.totalPaid,
        balanceDue: summary.totalBalance,
      }}
      emptyMessage="No sales in the selected period."
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
