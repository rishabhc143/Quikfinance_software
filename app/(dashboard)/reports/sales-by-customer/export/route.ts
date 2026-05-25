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
import { buildSalesByCustomer } from "@/lib/reports/sales-by-customer";
import { renderSalesByCustomerPdf } from "@/lib/reports/pdf/sales-by-customer";
import { parseRangeFromSearchParams } from "@/lib/reports/date-range";
import { logReportActivity } from "@/lib/reports/activity";

/**
 * RPT-SBC — Sales by Customer CSV / XLSX / PDF export.
 * Columns match Zoho: Name / Invoice Count / Sales / Sales With Tax.
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
    customer: searchParams.get("showCustomer") !== "0",
    invoiceCount: searchParams.get("showInvoiceCount") !== "0",
    sales: searchParams.get("showSales") !== "0",
    salesWithTax: searchParams.get("showSalesWithTax") !== "0",
  };

  const invoices = await db.invoice.findMany({
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
  });

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

  const rangeLabel = `${format(range.start, "dd/MM/yyyy")} — ${format(range.end, "dd/MM/yyyy")}`;
  const filename = `sales-by-customer-${csvDateSuffix(range.start)}_to_${csvDateSuffix(range.end)}`;

  if (fmt === "pdf") {
    const buf = await renderSalesByCustomerPdf({
      orgName: organization.name,
      rangeLabel,
      currency: organization.currency,
      rows: summary.rows,
      totalSales: summary.totalSales,
      totalSalesWithTax: summary.totalSalesWithTax,
    });

    await logReportActivity({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "sales-by-customer",
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
    const ws = wb.addWorksheet("Sales by Customer");

    ws.addRow([organization.name]);
    ws.addRow(["Sales by Customer"]);
    ws.addRow([rangeLabel]);
    ws.addRow([]);

    const headers: string[] = [];
    if (cols.customer) headers.push("Name");
    if (cols.invoiceCount) headers.push("Invoice Count");
    if (cols.sales) headers.push("Sales");
    if (cols.salesWithTax) headers.push("Sales With Tax");
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };

    for (const r of summary.rows) {
      const row: (string | number)[] = [];
      if (cols.customer) row.push(r.customerName);
      if (cols.invoiceCount) row.push(r.invoiceCount);
      if (cols.sales) row.push(r.sales);
      if (cols.salesWithTax) row.push(r.salesWithTax);
      ws.addRow(row);
    }

    const totalRow: (string | number)[] = [];
    if (cols.customer) totalRow.push("Total");
    if (cols.invoiceCount) totalRow.push("");
    if (cols.sales) totalRow.push(summary.totalSales);
    if (cols.salesWithTax) totalRow.push(summary.totalSalesWithTax);
    const wsTotalRow = ws.addRow(totalRow);
    wsTotalRow.font = { bold: true };

    const buf = await wb.xlsx.writeBuffer();

    await logReportActivity({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "sales-by-customer",
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
    if (cols.customer) row.name = r.customerName;
    if (cols.invoiceCount) row.invoice_count = r.invoiceCount;
    if (cols.sales) row.sales = r.sales;
    if (cols.salesWithTax) row.sales_with_tax = r.salesWithTax;
    return row;
  });
  const totalCsv: CsvRow = {};
  if (cols.customer) totalCsv.name = "Total";
  if (cols.sales) totalCsv.sales = summary.totalSales;
  if (cols.salesWithTax) totalCsv.sales_with_tax = summary.totalSalesWithTax;
  csvRows.push(totalCsv);

  const headerKeys: string[] = [];
  if (cols.customer) headerKeys.push("name");
  if (cols.invoiceCount) headerKeys.push("invoice_count");
  if (cols.sales) headerKeys.push("sales");
  if (cols.salesWithTax) headerKeys.push("sales_with_tax");

  await logReportActivity({
    organizationId: organization.id,
    userId: user.id,
    reportKey: "sales-by-customer",
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
