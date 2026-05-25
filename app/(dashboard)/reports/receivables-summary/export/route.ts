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
import { buildReceivablesSummary } from "@/lib/reports/receivables-summary";
import { renderReceivablesSummaryPdf } from "@/lib/reports/pdf/receivables-summary";
import { logReportActivity } from "@/lib/reports/activity";
import { formatMoney } from "@/lib/money";

/**
 * RPT-RECV — Receivables Summary CSV / XLSX / PDF export route.
 *
 * Mirrors the page's data fetching + `buildReceivablesSummary`
 * pipeline. Activity log gets a row per export.
 */
export async function GET(req: Request) {
  const { organization, user } = await requireOrganization();
  const url = new URL(req.url);
  const searchParams = url.searchParams;

  const fmt: "csv" | "xlsx" | "pdf" = parseFormat(searchParams.get("format"));
  const asOf = parseAsOf(searchParams.get("asOf"));
  const cols = {
    customer: searchParams.get("showCustomer") !== "0",
    invoiceNumber: searchParams.get("showInvoiceNumber") !== "0",
    issueDate: searchParams.get("showIssueDate") !== "0",
    dueDate: searchParams.get("showDueDate") !== "0",
    age: searchParams.get("showAge") !== "0",
    total: searchParams.get("showTotal") !== "0",
    amountPaid: searchParams.get("showAmountPaid") === "1",
    balanceDue: searchParams.get("showBalanceDue") !== "0",
  };

  const invoices = await db.invoice.findMany({
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
  });

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

  const asOfDisplay = format(asOf, "dd/MM/yyyy");
  const filename = `receivables-summary-${csvDateSuffix(asOf)}`;

  if (fmt === "pdf") {
    const buf = await renderReceivablesSummaryPdf({
      orgName: organization.name,
      asOfDisplay,
      currency: organization.currency,
      rows: summary.rows,
      totalOutstanding: summary.totalOutstanding,
    });

    await logReportActivity({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "receivables-summary",
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
    const ws = wb.addWorksheet("Receivables Summary");

    // Title rows
    ws.addRow([organization.name]);
    ws.addRow(["Receivables Summary"]);
    ws.addRow([`As of ${asOfDisplay}`]);
    ws.addRow([]);

    // Header
    const headers: string[] = [];
    if (cols.customer) headers.push("Customer");
    if (cols.invoiceNumber) headers.push("Invoice #");
    if (cols.issueDate) headers.push("Invoice Date");
    if (cols.dueDate) headers.push("Due Date");
    if (cols.age) headers.push("Age");
    if (cols.total) headers.push("Total");
    if (cols.amountPaid) headers.push("Amount Paid");
    if (cols.balanceDue) headers.push("Balance Due");
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };

    // Data rows
    for (const r of summary.rows) {
      const row: (string | number)[] = [];
      if (cols.customer) row.push(r.customerName);
      if (cols.invoiceNumber) row.push(r.invoiceNumber);
      if (cols.issueDate) row.push(format(r.issueDate, "yyyy-MM-dd"));
      if (cols.dueDate) row.push(format(r.dueDate, "yyyy-MM-dd"));
      if (cols.age) row.push(r.ageDays);
      if (cols.total) row.push(r.total);
      if (cols.amountPaid) row.push(r.amountPaid);
      if (cols.balanceDue) row.push(r.balanceDue);
      ws.addRow(row);
    }

    // Total row
    const totalLabel: (string | number)[] = headers.map((_, i) =>
      i === 0 ? "Total" : "",
    );
    const lastIdx = headers.length - 1;
    if (cols.balanceDue && lastIdx >= 0) {
      totalLabel[lastIdx] = summary.totalOutstanding;
    }
    const totalRow = ws.addRow(totalLabel);
    totalRow.font = { bold: true };

    const buf = await wb.xlsx.writeBuffer();

    await logReportActivity({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "receivables-summary",
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
    if (cols.invoiceNumber) row.invoice_number = r.invoiceNumber;
    if (cols.issueDate) row.invoice_date = format(r.issueDate, "yyyy-MM-dd");
    if (cols.dueDate) row.due_date = format(r.dueDate, "yyyy-MM-dd");
    if (cols.age) row.age_days = r.ageDays;
    if (cols.total) row.total = r.total;
    if (cols.amountPaid) row.amount_paid = r.amountPaid;
    if (cols.balanceDue) row.balance_due = r.balanceDue;
    return row;
  });
  // Total row
  const totalRow: CsvRow = {};
  if (cols.customer) totalRow.customer = "Total";
  if (cols.balanceDue) totalRow.balance_due = summary.totalOutstanding;
  csvRows.push(totalRow);

  const headerKeys: string[] = [];
  if (cols.customer) headerKeys.push("customer");
  if (cols.invoiceNumber) headerKeys.push("invoice_number");
  if (cols.issueDate) headerKeys.push("invoice_date");
  if (cols.dueDate) headerKeys.push("due_date");
  if (cols.age) headerKeys.push("age_days");
  if (cols.total) headerKeys.push("total");
  if (cols.amountPaid) headerKeys.push("amount_paid");
  if (cols.balanceDue) headerKeys.push("balance_due");

  await logReportActivity({
    organizationId: organization.id,
    userId: user.id,
    reportKey: "receivables-summary",
    eventType: "EXPORT_CSV",
    eventData: { format: "CSV", filename: `${filename}.csv` },
  });

  const csv = toCsv(csvRows, headerKeys);
  return csvResponse(filename, csv);
}

/* ───────────────────────── helpers ───────────────────────── */

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

// formatMoney imported but kept future-ready (currently unused in CSV
// since we keep raw numbers for spreadsheet aggregation).
void formatMoney;
