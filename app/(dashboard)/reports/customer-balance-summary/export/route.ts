import { format, parse, isValid } from "date-fns";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  toCsv,
  csvResponse,
  csvDateSuffix,
  type CsvRow,
} from "@/lib/reports/csv-export";
import { buildCustomerBalanceSummary } from "@/lib/reports/customer-balance-summary";
import { renderCustomerBalanceSummaryPdf } from "@/lib/reports/pdf/customer-balance-summary";
import { logReportActivity } from "@/lib/reports/activity";

/**
 * RPT-CBS — Customer Balance Summary CSV / XLSX / PDF export.
 */
export async function GET(req: Request) {
  const { organization, user } = await requireOrganization();
  const url = new URL(req.url);
  const searchParams = url.searchParams;

  const fmt: "csv" | "xlsx" | "pdf" = parseFormat(searchParams.get("format"));
  const asOf = parseAsOf(searchParams.get("asOf"));
  const excludeZero = searchParams.get("excludeZeroBalance") === "1";
  const cols = {
    customer: searchParams.get("showCustomer") !== "0",
    invoiced: searchParams.get("showInvoiced") !== "0",
    received: searchParams.get("showReceived") !== "0",
    balance: searchParams.get("showBalance") !== "0",
  };

  const invoices = await db.invoice.findMany({
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
  });

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

  const asOfDisplay = format(asOf, "dd/MM/yyyy");
  const filename = `customer-balance-summary-${csvDateSuffix(asOf)}`;

  if (fmt === "pdf") {
    const buf = await renderCustomerBalanceSummaryPdf({
      orgName: organization.name,
      asOfDisplay,
      currency: organization.currency,
      rows: summary.rows,
      totalInvoiced: summary.totalInvoiced,
      totalReceived: summary.totalReceived,
      totalBalance: summary.totalBalance,
    });
    await logReportActivity({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "customer-balance-summary",
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
    const ws = wb.addWorksheet("Customer Balance Summary");
    ws.addRow([organization.name]);
    ws.addRow(["Customer Balance Summary"]);
    ws.addRow([`As of ${asOfDisplay}`]);
    ws.addRow([]);
    const headers: string[] = [];
    if (cols.customer) headers.push("Customer Name");
    if (cols.invoiced) headers.push("Invoiced Amount");
    if (cols.received) headers.push("Amount Received");
    if (cols.balance) headers.push("Closing Balance");
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };

    for (const r of summary.rows) {
      const row: (string | number)[] = [];
      if (cols.customer) row.push(r.customerName);
      if (cols.invoiced) row.push(r.invoicedAmount);
      if (cols.received) row.push(r.amountReceived);
      if (cols.balance) row.push(r.closingBalance);
      ws.addRow(row);
    }

    const totalRow: (string | number)[] = [];
    if (cols.customer) totalRow.push("Total");
    if (cols.invoiced) totalRow.push(summary.totalInvoiced);
    if (cols.received) totalRow.push(summary.totalReceived);
    if (cols.balance) totalRow.push(summary.totalBalance);
    const wsTotal = ws.addRow(totalRow);
    wsTotal.font = { bold: true };

    const buf = await wb.xlsx.writeBuffer();
    await logReportActivity({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "customer-balance-summary",
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

  // CSV
  const csvRows: CsvRow[] = summary.rows.map((r) => {
    const row: CsvRow = {};
    if (cols.customer) row.customer_name = r.customerName;
    if (cols.invoiced) row.invoiced_amount = r.invoicedAmount;
    if (cols.received) row.amount_received = r.amountReceived;
    if (cols.balance) row.closing_balance = r.closingBalance;
    return row;
  });
  const totalCsv: CsvRow = {};
  if (cols.customer) totalCsv.customer_name = "Total";
  if (cols.invoiced) totalCsv.invoiced_amount = summary.totalInvoiced;
  if (cols.received) totalCsv.amount_received = summary.totalReceived;
  if (cols.balance) totalCsv.closing_balance = summary.totalBalance;
  csvRows.push(totalCsv);

  const headerKeys: string[] = [];
  if (cols.customer) headerKeys.push("customer_name");
  if (cols.invoiced) headerKeys.push("invoiced_amount");
  if (cols.received) headerKeys.push("amount_received");
  if (cols.balance) headerKeys.push("closing_balance");

  await logReportActivity({
    organizationId: organization.id,
    userId: user.id,
    reportKey: "customer-balance-summary",
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

function parseAsOf(s: string | null): Date {
  if (!s) return new Date();
  const d = parse(s, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : new Date();
}
