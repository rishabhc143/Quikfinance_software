/**
 * RPT-AR-DETAILS — AR Aging Details report (Zoho parity).
 *
 * The Summary view (`/reports/ar-aging`) aggregates outstanding by
 * customer. This Details view drops down one level: one row per
 * outstanding invoice with age + bucket.
 *
 * Bucket model mirrors Zoho's "Aging Intervals: N × M Days":
 *   intervalCount × intervalSize days, plus an open-ended overflow
 *   bucket for anything older.
 *
 *   Default (matches the screenshot): 4 × 15 = 60 day window
 *     - Current  (age <= 0,   not yet due)
 *     - 1-15     (age 1..15)
 *     - 16-30    (age 16..30)
 *     - 31-45    (age 31..45)
 *     - 46+      (age >= 46) — overflow
 *
 * Pure function over the Invoice + Contact tables (no Prisma calls
 * here — caller passes the rows). Keeps the lib unit-testable without
 * a DB.
 */

import type { ContactType, InvoiceStatus } from "@prisma/client";

/** One detail row in the report — matches the Zoho screenshot columns. */
export type ArAgingDetailRow = {
  invoiceId: string;
  /** yyyy-MM-dd — Invoice.issueDate */
  date: string;
  /** yyyy-MM-dd — Invoice.dueDate */
  dueDate: string;
  /** Invoice.number — shown in the "Transaction#" column */
  number: string;
  /** Hardcoded "Invoice" for v1; reserved for Credit Note / Debit Note in v2 */
  type: "Invoice";
  /** Human-readable status label (e.g. "Sent", "Partially Paid"). */
  status: string;
  customerId: string;
  customerName: string;
  /** Days overdue from the aging-by date. Negative = not yet due. */
  age: number;
  /** Bucket label this row falls into. */
  bucket: string;
  amount: number;
  balanceDue: number;
};

export type AgingBy = "dueDate" | "issueDate";

export type SortKey = "date" | "dueDate" | "age" | "balanceDue" | "customerName";
export type SortDir = "asc" | "desc";

/** Minimal invoice shape the compute function needs. Lets tests pass
 *  fixture objects without a full Prisma row. */
export type ArAgingDetailsInvoiceInput = {
  id: string;
  number: string;
  issueDate: Date;
  dueDate: Date;
  total: number;
  amountPaid: number;
  status: InvoiceStatus;
  contactId: string;
  contact: { displayName: string; type?: ContactType };
};

export type ComputeArAgingDetailsInput = {
  invoices: ArAgingDetailsInvoiceInput[];
  asOf: Date;
  agingBy?: AgingBy;
  /** Number of fixed-size buckets before the overflow. Default 4. */
  intervalCount?: number;
  /** Days per bucket. Default 15. */
  intervalSize?: number;
  /** Optional filter — drop rows whose contactId doesn't match. */
  customerId?: string;
  sortBy?: SortKey;
  sortDir?: SortDir;
};

/** Statuses we consider "outstanding" for aging purposes. DRAFT / VOID /
 *  WRITTEN_OFF / PAID never show up regardless of balance. */
const OUTSTANDING_STATUSES: ReadonlySet<InvoiceStatus> = new Set<InvoiceStatus>([
  "SENT",
  "PARTIALLY_PAID",
  "OVERDUE",
]);

/** Convert an InvoiceStatus enum value to the title-cased label users see. */
function statusLabel(s: InvoiceStatus): string {
  switch (s) {
    case "DRAFT": return "Draft";
    case "SENT": return "Sent";
    case "PARTIALLY_PAID": return "Partially Paid";
    case "OVERDUE": return "Overdue";
    case "PAID": return "Paid";
    case "VOID": return "Void";
    case "WRITTEN_OFF": return "Written Off";
    default: return s;
  }
}

/** Format a Date as `yyyy-MM-dd` in UTC to avoid TZ drift across the
 *  page → CSV → table pipeline. */
function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Days between two dates, floored. Positive when `from` is in the past
 *  relative to `asOf`. */
function daysBetween(asOf: Date, from: Date): number {
  return Math.floor((asOf.getTime() - from.getTime()) / 86_400_000);
}

/** Decide which bucket label an age falls into given the interval grid. */
export function bucketForAge(
  age: number,
  intervalCount: number,
  intervalSize: number
): string {
  if (age <= 0) return "Current";
  for (let i = 0; i < intervalCount; i++) {
    const lo = i * intervalSize + 1;
    const hi = (i + 1) * intervalSize;
    if (age >= lo && age <= hi) return `${lo}-${hi}`;
  }
  // Overflow bucket — anything older than the last fixed bucket.
  const overflowFloor = intervalCount * intervalSize + 1;
  return `${overflowFloor}+`;
}

/** Build the list of bucket labels in canonical order (for column
 *  headers / pivot tables / future Group-By-bucket grouping). */
export function bucketLabels(
  intervalCount: number,
  intervalSize: number
): string[] {
  const labels: string[] = ["Current"];
  for (let i = 0; i < intervalCount; i++) {
    const lo = i * intervalSize + 1;
    const hi = (i + 1) * intervalSize;
    labels.push(`${lo}-${hi}`);
  }
  labels.push(`${intervalCount * intervalSize + 1}+`);
  return labels;
}

/** Build the AR Aging Details rows from a list of invoices. Pure
 *  function — no DB access. */
export function computeArAgingDetails(
  input: ComputeArAgingDetailsInput
): ArAgingDetailRow[] {
  const {
    invoices,
    asOf,
    agingBy = "dueDate",
    intervalCount = 4,
    intervalSize = 15,
    customerId,
    sortBy = "age",
    sortDir = "desc",
  } = input;

  const rows: ArAgingDetailRow[] = [];
  for (const inv of invoices) {
    if (!OUTSTANDING_STATUSES.has(inv.status)) continue;
    if (customerId && inv.contactId !== customerId) continue;
    const balanceDue = Number(inv.total) - Number(inv.amountPaid);
    if (balanceDue <= 0) continue;

    const ageFrom = agingBy === "dueDate" ? inv.dueDate : inv.issueDate;
    const age = daysBetween(asOf, ageFrom);
    const bucket = bucketForAge(age, intervalCount, intervalSize);

    rows.push({
      invoiceId: inv.id,
      date: isoDate(inv.issueDate),
      dueDate: isoDate(inv.dueDate),
      number: inv.number,
      type: "Invoice",
      status: statusLabel(inv.status),
      customerId: inv.contactId,
      customerName: inv.contact.displayName,
      age,
      bucket,
      amount: Number(inv.total),
      balanceDue,
    });
  }

  // Sort with a deterministic tiebreaker on invoiceId so output is
  // stable across runs / pagination.
  rows.sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    let cmp = 0;
    switch (sortBy) {
      case "date": cmp = a.date.localeCompare(b.date); break;
      case "dueDate": cmp = a.dueDate.localeCompare(b.dueDate); break;
      case "age": cmp = a.age - b.age; break;
      case "balanceDue": cmp = a.balanceDue - b.balanceDue; break;
      case "customerName": cmp = a.customerName.localeCompare(b.customerName); break;
    }
    if (cmp !== 0) return cmp * dir;
    return a.invoiceId.localeCompare(b.invoiceId);
  });

  return rows;
}
