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
import { buildPaymentsReceived } from "@/lib/reports/payments-received";
import { renderPaymentsReceivedPdf } from "@/lib/reports/pdf/payments-received";
import { parseRangeFromSearchParams } from "@/lib/reports/date-range";
import { logReportActivity } from "@/lib/reports/activity";

/**
 * RPT-PR — Payments Received CSV / XLSX / PDF export route.
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
    date: searchParams.get("showDate") !== "0",
    number: searchParams.get("showNumber") !== "0",
    customer: searchParams.get("showCustomer") !== "0",
    mode: searchParams.get("showMode") !== "0",
    reference: searchParams.get("showReference") !== "0",
    amount: searchParams.get("showAmount") !== "0",
  };

  const payments = await db.paymentReceived.findMany({
    where: {
      organizationId: organization.id,
      deletedAt: null,
      paymentDate: { gte: range.start, lte: range.end },
    },
    select: {
      id: true,
      number: true,
      paymentDate: true,
      amount: true,
      paymentMode: true,
      reference: true,
      contact: { select: { id: true, displayName: true } },
    },
  });

  const summary = buildPaymentsReceived(
    payments.map((p) => ({
      id: p.id,
      number: p.number,
      paymentDate: p.paymentDate,
      amount: Number(p.amount),
      paymentMode: p.paymentMode,
      reference: p.reference,
      contact: { id: p.contact.id, name: p.contact.displayName },
    })),
  );

  const rangeLabel = `${format(range.start, "dd/MM/yyyy")} — ${format(range.end, "dd/MM/yyyy")}`;
  const filename = `payments-received-${csvDateSuffix(range.start)}_to_${csvDateSuffix(range.end)}`;

  if (fmt === "pdf") {
    const buf = await renderPaymentsReceivedPdf({
      orgName: organization.name,
      rangeLabel,
      currency: organization.currency,
      rows: summary.rows,
      totalAmount: summary.totalAmount,
    });

    await logReportActivity({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "payments-received",
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
    const ws = wb.addWorksheet("Payments Received");

    ws.addRow([organization.name]);
    ws.addRow(["Payments Received"]);
    ws.addRow([rangeLabel]);
    ws.addRow([]);

    const headers: string[] = [];
    if (cols.date) headers.push("Date");
    if (cols.number) headers.push("Payment #");
    if (cols.customer) headers.push("Customer");
    if (cols.mode) headers.push("Payment Mode");
    if (cols.reference) headers.push("Reference");
    if (cols.amount) headers.push("Amount");
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };

    for (const r of summary.rows) {
      const row: (string | number)[] = [];
      if (cols.date) row.push(format(r.paymentDate, "yyyy-MM-dd"));
      if (cols.number) row.push(r.paymentNumber);
      if (cols.customer) row.push(r.customerName);
      if (cols.mode) row.push(r.paymentMode);
      if (cols.reference) row.push(r.reference);
      if (cols.amount) row.push(r.amount);
      ws.addRow(row);
    }

    const totalLabel: (string | number)[] = headers.map((_, i) =>
      i === 0 ? "Total" : "",
    );
    const lastIdx = headers.length - 1;
    if (cols.amount && lastIdx >= 0) totalLabel[lastIdx] = summary.totalAmount;
    const totalRow = ws.addRow(totalLabel);
    totalRow.font = { bold: true };

    const buf = await wb.xlsx.writeBuffer();

    await logReportActivity({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "payments-received",
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
    if (cols.date) row.date = format(r.paymentDate, "yyyy-MM-dd");
    if (cols.number) row.payment_number = r.paymentNumber;
    if (cols.customer) row.customer = r.customerName;
    if (cols.mode) row.payment_mode = r.paymentMode;
    if (cols.reference) row.reference = r.reference;
    if (cols.amount) row.amount = r.amount;
    return row;
  });
  const totalRow: CsvRow = {};
  if (cols.date) totalRow.date = "Total";
  if (cols.amount) totalRow.amount = summary.totalAmount;
  csvRows.push(totalRow);

  const headerKeys: string[] = [];
  if (cols.date) headerKeys.push("date");
  if (cols.number) headerKeys.push("payment_number");
  if (cols.customer) headerKeys.push("customer");
  if (cols.mode) headerKeys.push("payment_mode");
  if (cols.reference) headerKeys.push("reference");
  if (cols.amount) headerKeys.push("amount");

  await logReportActivity({
    organizationId: organization.id,
    userId: user.id,
    reportKey: "payments-received",
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
