import { format } from "date-fns";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  toCsv,
  csvResponse,
  csvDateSuffix,
  type CsvRow,
} from "@/lib/reports/csv-export";
import { buildSalesByItem } from "@/lib/reports/sales-by-item";
import { renderSalesByItemPdf } from "@/lib/reports/pdf/sales-by-item";
import { parseRangeFromSearchParams } from "@/lib/reports/date-range";
import { logReportActivity } from "@/lib/reports/activity";

/**
 * RPT-SBI — Sales by Item CSV / XLSX / PDF export.
 */
export async function GET(req: Request) {
  const { organization, user } = await requireOrganization();
  const url = new URL(req.url);
  const searchParams = url.searchParams;
  const params = Object.fromEntries(searchParams.entries());

  const fmt: "csv" | "xlsx" | "pdf" = parseFormat(searchParams.get("format"));
  const { range } = parseRangeFromSearchParams(params, {
    fiscalYearStartMonth: organization.fiscalYearStart,
    defaultPreset: "this-month",
  });

  const cols = {
    item: searchParams.get("showItem") !== "0",
    quantity: searchParams.get("showQuantity") !== "0",
    amount: searchParams.get("showAmount") !== "0",
    average: searchParams.get("showAverage") !== "0",
  };

  const lines = await db.invoiceLineItem.findMany({
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
  });

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

  const rangeLabel = `${format(range.start, "dd/MM/yyyy")} — ${format(range.end, "dd/MM/yyyy")}`;
  const filename = `sales-by-item-${csvDateSuffix(range.start)}_to_${csvDateSuffix(range.end)}`;
  const avgPriceTotal =
    summary.totalQuantity > 0
      ? Math.round((summary.totalAmount / summary.totalQuantity) * 100) / 100
      : 0;

  if (fmt === "pdf") {
    const buf = await renderSalesByItemPdf({
      orgName: organization.name,
      rangeLabel,
      currency: organization.currency,
      rows: summary.rows,
      totalQuantity: summary.totalQuantity,
      totalAmount: summary.totalAmount,
      averagePrice: avgPriceTotal,
    });
    await logReportActivity({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "sales-by-item",
      eventType: "EXPORT_PDF",
      eventData: { format: "PDF", filename: `${filename}.pdf` },
    });
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  }

  if (fmt === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sales by Item");
    ws.addRow([organization.name]);
    ws.addRow(["Sales by Item"]);
    ws.addRow([rangeLabel]);
    ws.addRow([]);
    const headers: string[] = [];
    if (cols.item) headers.push("Item Name");
    if (cols.quantity) headers.push("Quantity Sold");
    if (cols.amount) headers.push("Amount");
    if (cols.average) headers.push("Average Price");
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };

    for (const r of summary.rows) {
      const row: (string | number)[] = [];
      if (cols.item) row.push(r.itemName);
      if (cols.quantity) row.push(r.quantitySold);
      if (cols.amount) row.push(r.amount);
      if (cols.average) row.push(r.averagePrice);
      ws.addRow(row);
    }

    const totalRow: (string | number)[] = [];
    if (cols.item) totalRow.push("Total");
    if (cols.quantity) totalRow.push(summary.totalQuantity);
    if (cols.amount) totalRow.push(summary.totalAmount);
    if (cols.average) totalRow.push(avgPriceTotal);
    const wsTotalRow = ws.addRow(totalRow);
    wsTotalRow.font = { bold: true };

    const buf = await wb.xlsx.writeBuffer();

    await logReportActivity({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "sales-by-item",
      eventType: "EXPORT_XLSX",
      eventData: { format: "XLSX", filename: `${filename}.xlsx` },
    });

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  }

  // Default: CSV
  const csvRows: CsvRow[] = summary.rows.map((r) => {
    const row: CsvRow = {};
    if (cols.item) row.item_name = r.itemName;
    if (cols.quantity) row.quantity_sold = r.quantitySold;
    if (cols.amount) row.amount = r.amount;
    if (cols.average) row.average_price = r.averagePrice;
    return row;
  });
  const totalCsv: CsvRow = {};
  if (cols.item) totalCsv.item_name = "Total";
  if (cols.quantity) totalCsv.quantity_sold = summary.totalQuantity;
  if (cols.amount) totalCsv.amount = summary.totalAmount;
  if (cols.average) totalCsv.average_price = avgPriceTotal;
  csvRows.push(totalCsv);

  const headerKeys: string[] = [];
  if (cols.item) headerKeys.push("item_name");
  if (cols.quantity) headerKeys.push("quantity_sold");
  if (cols.amount) headerKeys.push("amount");
  if (cols.average) headerKeys.push("average_price");

  await logReportActivity({
    organizationId: organization.id,
    userId: user.id,
    reportKey: "sales-by-item",
    eventType: "EXPORT_CSV",
    eventData: { format: "CSV", filename: `${filename}.csv` },
  });

  const csv = toCsv(csvRows, headerKeys);
  return csvResponse(filename, csv);
}

function parseFormat(s: string | null): "csv" | "xlsx" | "pdf" {
  if (s === "pdf") return "pdf";
  if (s === "xlsx") return "xlsx";
  return "csv";
}
