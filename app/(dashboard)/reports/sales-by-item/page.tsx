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
  buildSalesByItem,
  type SalesByItemRow,
} from "@/lib/reports/sales-by-item";
import type { ListReportColumn } from "@/lib/reports/list-report-helpers";
import type { CustomizeColumnDescriptor } from "@/components/reports/customize-report-drawer";

export const metadata = { title: "Sales by Item" };

/**
 * RPT-SBI — Sales by Item page.
 *
 * Aggregates invoice lines by item for the chosen date range. Columns
 * match Zoho: Item Name / Quantity Sold / Amount / Average Price.
 */

const COLUMN_DESCRIPTORS: CustomizeColumnDescriptor[] = [
  { key: "showItem", label: "Item Name", defaultEnabled: true },
  { key: "showQuantity", label: "Quantity Sold", defaultEnabled: true },
  { key: "showAmount", label: "Amount", defaultEnabled: true },
  { key: "showAverage", label: "Average Price", defaultEnabled: true },
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

export default async function SalesByItemPage({
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
    item: isVisible(searchParams, "showItem", true),
    quantity: isVisible(searchParams, "showQuantity", true),
    amount: isVisible(searchParams, "showAmount", true),
    average: isVisible(searchParams, "showAverage", true),
  };

  const [lines, activityRows, existingSchedule] = await Promise.all([
    db.invoiceLineItem.findMany({
      where: {
        invoice: {
          organizationId: organization.id,
          deletedAt: null,
          issueDate: { gte: range.start, lte: range.end },
        },
      },
      select: {
        itemId: true,
        description: true,
        quantity: true,
        amount: true,
        item: { select: { id: true, name: true } },
        invoice: { select: { status: true } },
      },
    }),
    getRecentReportActivity(organization.id, "sales-by-item", 20),
    getExistingSchedule({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "sales-by-item",
    }),
  ]);

  const summary = buildSalesByItem(
    lines.map((l) => ({
      itemId: l.itemId,
      description: l.description,
      quantity: Number(l.quantity),
      amount: Number(l.amount),
      item: l.item ? { id: l.item.id, name: l.item.name } : null,
      invoiceStatus: l.invoice.status,
    })),
  );

  const columns: ListReportColumn<SalesByItemRow>[] = [];
  if (cols.item)
    columns.push({ key: "itemName", label: "Item Name", type: "text" });
  if (cols.quantity)
    columns.push({ key: "quantitySold", label: "Quantity Sold", type: "number" });
  if (cols.amount)
    columns.push({ key: "amount", label: "Amount", type: "money" });
  if (cols.average)
    columns.push({ key: "averagePrice", label: "Average Price", type: "money" });

  const exportParams = new URLSearchParams();
  exportParams.set("preset", preset);
  if (preset === "custom") {
    exportParams.set("from", format(range.start, "yyyy-MM-dd"));
    exportParams.set("to", format(range.end, "yyyy-MM-dd"));
  }
  if (!cols.item) exportParams.set("showItem", "0");
  if (!cols.quantity) exportParams.set("showQuantity", "0");
  if (!cols.amount) exportParams.set("showAmount", "0");
  if (!cols.average) exportParams.set("showAverage", "0");

  const rangeLabel = `${format(range.start, "dd/MM/yyyy")} — ${format(range.end, "dd/MM/yyyy")}`;
  const avgPriceTotal =
    summary.totalQuantity > 0
      ? Math.round((summary.totalAmount / summary.totalQuantity) * 100) / 100
      : 0;

  return (
    <ListReportTemplate<SalesByItemRow>
      reportKey="sales-by-item"
      title="Sales by Item"
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
        exportBaseUrl: "/reports/sales-by-item/export",
        exportParams: exportParams.toString(),
        customizableColumns: COLUMN_DESCRIPTORS,
        activityRows,
        existingSchedule,
      }}
      columns={columns}
      rows={summary.rows}
      totals={{
        quantitySold: summary.totalQuantity,
        amount: summary.totalAmount,
        averagePrice: avgPriceTotal,
      }}
      emptyMessage="No items sold in the selected period."
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
