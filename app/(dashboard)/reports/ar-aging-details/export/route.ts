import type { NextRequest } from "next/server";
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
  type AgingBy,
  type SortDir,
  type SortKey,
} from "@/lib/reports/ar-aging-details";

/**
 * RPT-AR-DETAILS — CSV export. Shares filter parsing with the page so
 * the user gets the same data they're looking at on screen.
 */
export async function GET(request: NextRequest) {
  const { organization } = await requireOrganization();
  const { searchParams } = new URL(request.url);

  const asOf = parseDateOrToday(searchParams.get("asOf"));
  const agingBy: AgingBy =
    searchParams.get("agingBy") === "issueDate" ? "issueDate" : "dueDate";
  const intervalCount = clampInt(searchParams.get("intervalCount"), 4, 1, 12);
  const intervalSize = clampInt(searchParams.get("intervalSize"), 15, 1, 365);
  const sortBy = parseSortBy(searchParams.get("sort"));
  const sortDir: SortDir =
    searchParams.get("dir") === "asc" ? "asc" : "desc";

  const invoices = await db.invoice.findMany({
    where: {
      organizationId: organization.id,
      deletedAt: null,
      status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
    },
    include: { contact: { select: { displayName: true, type: true } } },
  });

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
    asOf,
    agingBy,
    intervalCount,
    intervalSize,
    sortBy,
    sortDir,
  });

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

  const columns = [
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

  const csv = toCsv(csvRows, columns);
  return csvResponse(`ar-aging-details-${csvDateSuffix(asOf)}`, csv);
}

/* ───────────────────────── helpers (shared shape with page.tsx) ───────────────────────── */

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
