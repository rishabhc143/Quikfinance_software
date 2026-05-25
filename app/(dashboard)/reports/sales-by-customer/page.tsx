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

// Columns match Zoho Books' Sales by Customer report exactly per
// docs/zoho-reports.yaml. The Amount Paid + Balance Due columns we
// previously had here move to Customer Balance Summary where they
// semantically belong.
const COLUMN_DESCRIPTORS: CustomizeColumnDescriptor[] = [
  { key: "showCustomer", label: "Name", defaultEnabled: true },
  { key: "showInvoiceCount", label: "Invoice Count", defaultEnabled: true },
  { key: "showSales", label: "Sales", defaultEnabled: true },
  { key: "showSalesWithTax", label: "Sales With Tax", defaultEnabled: true },
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
    sales: isVisible(searchParams, "showSales", true),
    salesWithTax: isVisible(searchParams, "showSalesWithTax", true),
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
        taxTotal: true,
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
      taxTotal: Number(i.taxTotal),
      status: i.status,
      contact: { id: i.contact.id, name: i.contact.displayName },
    })),
  );

  const columns: ListReportColumn<SalesByCustomerRow>[] = [];
  if (cols.customer)
    columns.push({ key: "customerName", label: "Name", type: "text" });
  if (cols.invoiceCount)
    columns.push({ key: "invoiceCount", label: "Invoice Count", type: "number" });
  if (cols.sales)
    columns.push({ key: "sales", label: "Sales", type: "money" });
  if (cols.salesWithTax)
    columns.push({ key: "salesWithTax", label: "Sales With Tax", type: "money" });

  const exportParams = new URLSearchParams();
  exportParams.set("preset", preset);
  if (preset === "custom") {
    exportParams.set("from", format(range.start, "yyyy-MM-dd"));
    exportParams.set("to", format(range.end, "yyyy-MM-dd"));
  }
  if (!cols.customer) exportParams.set("showCustomer", "0");
  if (!cols.invoiceCount) exportParams.set("showInvoiceCount", "0");
  if (!cols.sales) exportParams.set("showSales", "0");
  if (!cols.salesWithTax) exportParams.set("showSalesWithTax", "0");

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
        sales: summary.totalSales,
        salesWithTax: summary.totalSalesWithTax,
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
