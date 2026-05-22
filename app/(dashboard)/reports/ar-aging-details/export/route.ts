import type { NextRequest } from "next/server";
import type { InvoiceStatus } from "@prisma/client";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  toCsv,
  csvResponse,
  csvDateSuffix,
  type CsvRow,
} from "@/lib/reports/csv-export";
import {
  computeArAgingDetails,
  groupArAgingDetails,
  bucketLabels,
  type AgingBy,
  type Entity,
  type GroupBy,
  type SortDir,
  type SortKey,
} from "@/lib/reports/ar-aging-details";
import { renderArAgingDetailsPdf } from "@/lib/reports/pdf/ar-aging-details";
import { logReportActivity } from "@/lib/reports/activity";

// DOC-AR-DETAILS: Column keys for the AR Aging Details report.
// Mirrors the COL_PARAM_BY_KEY in page.tsx.
const ALL_COLUMN_KEYS = [
  "date",
  "dueDate",
  "number",
  "type",
  "status",
  "customerName",
  "age",
  "amount",
  "balanceDue",
];

/**
 * RPT-AR-DETAILS — CSV + PDF export. Shares filter parsing with the
 * page so the user gets exactly what they see on screen.
 */
export async function GET(request: NextRequest) {
  const { organization, user } = await requireOrganization();
  const { searchParams } = new URL(request.url);

  const format = (searchParams.get("format") || "csv").toLowerCase();

  const asOf = parseDateOrToday(searchParams.get("asOf"));
  const agingBy: AgingBy =
    searchParams.get("agingBy") === "issueDate" ? "issueDate" : "dueDate";
  const intervalCount = clampInt(searchParams.get("intervalCount"), 4, 1, 12);
  const intervalSize = clampInt(searchParams.get("intervalSize"), 15, 1, 365);
  const sortBy = parseSortBy(searchParams.get("sort"));
  const sortDir: SortDir = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const groupBy = parseGroupBy(searchParams.get("groupBy"));
  const entities = parseEntities(searchParams.get("entities"));
  const cols = parseColsFromSearchParams(searchParams);
  const statusFilterArr = parseStatuses(searchParams.get("statuses"));
  const customerId = searchParams.get("customerId")?.trim() || undefined;
  const amountMinRaw = searchParams.get("amountMin");
  const amountMaxRaw = searchParams.get("amountMax");
  const amountMin = amountMinRaw && amountMinRaw.trim() ? Number(amountMinRaw) : undefined;
  const amountMax = amountMaxRaw && amountMaxRaw.trim() ? Number(amountMaxRaw) : undefined;
  const bucketFilter = parseBuckets(searchParams.get("buckets"));

  // Same as page.tsx — always query both, the lib filters by entities.
  const [invoices, creditNotes] = await Promise.all([
    db.invoice.findMany({
      where: {
        organizationId: organization.id,
        deletedAt: null,
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
      },
      include: { contact: { select: { displayName: true, type: true } } },
    }),
    db.creditNote.findMany({
      where: {
        organizationId: organization.id,
        deletedAt: null,
        status: "OPEN",
      },
      include: { contact: { select: { displayName: true } } },
    }),
  ]);

  const rows = computeArAgingDetails({
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      total: Number(i.total),
      amountPaid: Number(i.amountPaid),
      status: i.status,
      contactId: i.contactId,
      contact: i.contact,
    })),
    creditNotes: creditNotes.map((c) => ({
      id: c.id,
      number: c.number,
      date: c.date,
      total: Number(c.total),
      amountApplied: Number(c.amountApplied),
      amountRefunded: Number(c.amountRefunded),
      status: c.status,
      contactId: c.contactId,
      contact: c.contact,
    })),
    asOf,
    agingBy,
    intervalCount,
    intervalSize,
    entities,
    statusFilter: statusFilterArr,
    customerId,
    amountMin,
    amountMax,
    bucketFilter,
    sortBy,
    sortDir,
  });

  const filename = `ar-aging-details-${csvDateSuffix(asOf)}`;

  if (format === "pdf") {
    const bucketsForOrdering = bucketLabels(intervalCount, intervalSize);
    const groups = groupArAgingDetails(rows, groupBy, bucketsForOrdering);
    const grandTotal = rows.reduce((s, r) => s + r.balanceDue, 0);
    const reportTitle =
      agingBy === "dueDate"
        ? "AR Aging Details By Invoice Due Date"
        : "AR Aging Details By Invoice Date";

    const buf = await renderArAgingDetailsPdf({
      orgName: organization.name,
      reportTitle,
      asOfDisplay: formatDateForDisplay(asOf),
      groups,
      flatRows: rows,
      grandTotal,
      cols,
      groupBy,
    });

    // DOC-AR-DETAILS: Log the export event for the Activity drawer.
    await logReportActivity({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "ar-aging-details",
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

  if (format === "xlsx") {
    // DOC-AR-DETAILS: XLSX export via exceljs. Mirrors the data
    // layout of CSV but with cell formatting (header row bold,
    // number columns right-aligned, currency formatting).
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("AR Aging Details");

    ws.columns = [
      { header: "Date", key: "date", width: 12 },
      { header: "Due Date", key: "dueDate", width: 12 },
      { header: "Transaction#", key: "number", width: 16 },
      { header: "Type", key: "type", width: 12 },
      { header: "Status", key: "status", width: 14 },
      { header: "Customer Name", key: "customerName", width: 28 },
      { header: "Age (days)", key: "age", width: 10 },
      { header: "Bucket", key: "bucket", width: 12 },
      { header: "Amount", key: "amount", width: 14 },
      { header: "Balance Due", key: "balanceDue", width: 14 },
    ];

    // Header styling
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: "middle" };

    for (const r of rows) {
      ws.addRow({
        date: r.date,
        dueDate: r.dueDate,
        number: r.number,
        type: r.type,
        status: r.status,
        customerName: r.customerName,
        age: r.age,
        bucket: r.bucket,
        amount: r.amount,
        balanceDue: r.balanceDue,
      });
    }

    // Number formatting on Amount / Balance Due columns
    ws.getColumn("amount").numFmt = "#,##0.00";
    ws.getColumn("balanceDue").numFmt = "#,##0.00";

    const buf = await wb.xlsx.writeBuffer();

    await logReportActivity({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "ar-aging-details",
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
  const csvRows: CsvRow[] = rows.map((r) => ({
    "Date": r.date,
    "Due Date": r.dueDate,
    "Transaction#": r.number,
    "Type": r.type,
    "Status": r.status,
    "Customer Name": r.customerName,
    "Age (days)": r.age,
    "Bucket": r.bucket,
    "Amount": r.amount,
    "Balance Due": r.balanceDue,
  }));

  const allColumns = [
    "Date",
    "Due Date",
    "Transaction#",
    "Type",
    "Status",
    "Customer Name",
    "Age (days)",
    "Bucket",
    "Amount",
    "Balance Due",
  ];

  await logReportActivity({
    organizationId: organization.id,
    userId: user.id,
    reportKey: "ar-aging-details",
    eventType: "EXPORT_CSV",
    eventData: { format: "CSV", filename: `${filename}.csv` },
  });

  const csv = toCsv(csvRows, allColumns);
  return csvResponse(`ar-aging-details-${csvDateSuffix(asOf)}`, csv);
}

/* ───────────────────────── helpers ───────────────────────── */

function parseDateOrToday(s: string | null): Date {
  if (!s) return new Date();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date();
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function clampInt(
  s: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  if (!s) return fallback;
  const n = Number(s);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parseSortBy(s: string | null): SortKey {
  switch (s) {
    case "date":
    case "dueDate":
    case "age":
    case "balanceDue":
    case "customerName":
      return s;
    default:
      return "age";
  }
}

function parseGroupBy(s: string | null): GroupBy {
  if (s === "customer" || s === "bucket" || s === "status") return s;
  return "none";
}

function parseEntities(s: string | null): Entity[] {
  if (!s) return ["invoice"];
  const parts = s
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x === "invoice" || x === "creditnote") as Entity[];
  return parts.length === 0 ? ["invoice"] : parts;
}

// DOC-AR-DETAILS: Map an AR Aging column key ("date") to the URL
// param the shared Customize Report drawer uses ("showDate"). Mirrors
// COL_PARAM_BY_KEY in page.tsx.
const COL_PARAM_BY_KEY: Record<string, string> = {
  date: "showDate",
  dueDate: "showDueDate",
  number: "showNumber",
  type: "showType",
  status: "showStatus",
  customerName: "showCustomerName",
  age: "showAge",
  amount: "showAmount",
  balanceDue: "showBalanceDue",
};

function parseColsFromSearchParams(
  searchParams: URLSearchParams
): string[] {
  return ALL_COLUMN_KEYS.filter((key) => {
    const paramKey = COL_PARAM_BY_KEY[key];
    const value = paramKey ? searchParams.get(paramKey) : null;
    return value !== "0";
  });
}

const VALID_STATUSES: ReadonlyArray<InvoiceStatus> = [
  "SENT",
  "PARTIALLY_PAID",
  "OVERDUE",
];

function parseStatuses(s: string | null): InvoiceStatus[] | undefined {
  if (!s) return undefined;
  const parts = s.split(",").map((x) => x.trim()) as InvoiceStatus[];
  const filtered = parts.filter((x) => VALID_STATUSES.includes(x));
  return filtered.length > 0 ? filtered : undefined;
}

function parseBuckets(s: string | null): string[] | undefined {
  if (!s) return undefined;
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function formatDateForDisplay(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}
