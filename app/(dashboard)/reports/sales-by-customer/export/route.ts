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
    gross: searchParams.get("showGross") !== "0",
    paid: searchParams.get("showPaid") !== "0",
    balance: searchParams.get("showBalance") !== "0",
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
      amountPaid: true,
      status: true,
      contact: { select: { id: true, displayName: true } },
    },
  });

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

  const rangeLabel = `${format(range.start, "dd/MM/yyyy")} — ${format(range.end, "dd/MM/yyyy")}`;
  const filename = `sales-by-customer-${csvDateSuffix(range.start)}_to_${csvDateSuffix(range.end)}`;

  if (fmt === "pdf") {
    const buf = await renderSalesByCustomerPdf({
      orgName: organization.name,
      rangeLabel,
      currency: organization.currency,
      rows: summary.rows,
      totalGross: summary.totalGross,
      totalPaid: summary.totalPaid,
      totalBalance: summary.totalBalance,
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
    if (cols.customer) headers.push("Customer");
    if (cols.invoiceCount) headers.push("Invoices");
    if (cols.gross) headers.push("Gross Sales");
    if (cols.paid) headers.push("Amount Paid");
    if (cols.balance) headers.push("Balance Due");
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };

    for (const r of summary.rows) {
      const row: (string | number)[] = [];
      if (cols.customer) row.push(r.customerName);
      if (cols.invoiceCount) row.push(r.invoiceCount);
      if (cols.gross) row.push(r.grossSales);
      if (cols.paid) row.push(r.amountPaid);
      if (cols.balance) row.push(r.balanceDue);
      ws.addRow(row);
    }

    // Total row
    const totalRow: (string | number)[] = [];
    if (cols.customer) totalRow.push("Total");
    if (cols.invoiceCount) totalRow.push("");
    if (cols.gross) totalRow.push(summary.totalGross);
    if (cols.paid) totalRow.push(summary.totalPaid);
    if (cols.balance) totalRow.push(summary.totalBalance);
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
    if (cols.customer) row.customer = r.customerName;
    if (cols.invoiceCount) row.invoices = r.invoiceCount;
    if (cols.gross) row.gross_sales = r.grossSales;
    if (cols.paid) row.amount_paid = r.amountPaid;
    if (cols.balance) row.balance_due = r.balanceDue;
    return row;
  });
  const totalCsv: CsvRow = {};
  if (cols.customer) totalCsv.customer = "Total";
  if (cols.gross) totalCsv.gross_sales = summary.totalGross;
  if (cols.paid) totalCsv.amount_paid = summary.totalPaid;
  if (cols.balance) totalCsv.balance_due = summary.totalBalance;
  csvRows.push(totalCsv);

  const headerKeys: string[] = [];
  if (cols.customer) headerKeys.push("customer");
  if (cols.invoiceCount) headerKeys.push("invoices");
  if (cols.gross) headerKeys.push("gross_sales");
  if (cols.paid) headerKeys.push("amount_paid");
  if (cols.balance) headerKeys.push("balance_due");

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
