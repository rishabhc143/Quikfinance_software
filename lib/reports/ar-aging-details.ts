/**
 * RPT-AR-DETAILS — AR Aging Details report (Zoho parity, v2).
 *
 * v1 (PR #243) shipped flat-row computation + bucket math + age math.
 *
 * v2 adds:
 *   - Credit Notes as a new entity type (negative amounts, reduces AR)
 *   - Status / amount-range / bucket filters
 *   - Group By (customer / bucket / status) with subtotals
 *
 * Pure function over the Invoice + CreditNote + Contact tables (no
 * Prisma calls here — caller passes the rows). Keeps the lib
 * unit-testable without a DB.
 */

import type { ContactType, InvoiceStatus } from "@prisma/client";

/** One detail row in the report — matches the Zoho screenshot columns. */
export type ArAgingDetailRow = {
  /** Source row id (invoiceId OR creditNoteId). Used as the React key
   *  and for sort tiebreaks. */
  rowId: string;
  /** Discriminator for the source. Useful for client UIs that want
   *  to style Invoice rows vs Credit Note rows differently. */
  source: "invoice" | "creditnote";
  /** yyyy-MM-dd — Invoice.issueDate / CreditNote.date */
  date: string;
  /** yyyy-MM-dd — Invoice.dueDate / CreditNote.date (credit notes
   *  don't have a separate due date so we use the document date). */
  dueDate: string;
  /** Invoice.number / CreditNote.number — shown in "Transaction#" */
  number: string;
  /** Display label: "Invoice" or "Credit Note" */
  type: "Invoice" | "Credit Note";
  /** Human-readable status label. */
  status: string;
  customerId: string;
  customerName: string;
  /** Days overdue from the aging-by date. Negative = not yet due. */
  age: number;
  /** Bucket label this row falls into. */
  bucket: string;
  /** For invoices: positive total. For credit notes: negative
   *  (since a credit reduces the customer's balance). */
  amount: number;
  /** For invoices: total - amountPaid. For credit notes: -(total -
   *  amountApplied - amountRefunded). Always signed appropriately. */
  balanceDue: number;
};

export type AgingBy = "dueDate" | "issueDate";

export type SortKey =
  | "date"
  | "dueDate"
  | "age"
  | "balanceDue"
  | "customerName";

export type SortDir = "asc" | "desc";

export type GroupBy = "none" | "customer" | "bucket" | "status";

export type Entity = "invoice" | "creditnote";

/** Grouped output — used when groupBy !== "none". */
export type ArAgingDetailGroup = {
  /** Stable key for React + URL state. */
  groupKey: string;
  /** Display label rendered in the group header row. */
  groupLabel: string;
  rows: ArAgingDetailRow[];
  /** Sum of balanceDue across all rows in the group (signed). */
  subtotal: number;
};

/** Minimal invoice shape the compute function needs. */
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

/** Minimal credit-note shape. Status is stored as string in the DB
 *  (no Prisma enum yet) — we normalise on the way in. */
export type ArAgingCreditNoteInput = {
  id: string;
  number: string;
  date: Date;
  total: number;
  amountApplied: number;
  amountRefunded: number;
  status: string;
  contactId: string;
  contact: { displayName: string };
};

export type ComputeArAgingDetailsInput = {
  invoices: ArAgingDetailsInvoiceInput[];
  /** Credit Notes are optional. When omitted, behaviour is identical
   *  to v1 (Invoice-only). */
  creditNotes?: ArAgingCreditNoteInput[];
  asOf: Date;
  agingBy?: AgingBy;
  /** Number of fixed-size buckets before the overflow. Default 4. */
  intervalCount?: number;
  /** Days per bucket. Default 15. */
  intervalSize?: number;
  /** Optional filter — drop rows whose contactId doesn't match. */
  customerId?: string;
  /** Restrict which entity types are included. Default: ["invoice"]. */
  entities?: Entity[];
  /** Restrict which invoice statuses appear. Defaults to all 3
   *  outstanding statuses (matches v1). Credit Notes are always
   *  filtered separately via their own OPEN status. */
  statusFilter?: InvoiceStatus[];
  /** Inclusive lower bound on the row's `amount` (not balanceDue). */
  amountMin?: number;
  /** Inclusive upper bound on the row's `amount`. */
  amountMax?: number;
  /** Restrict to specific buckets (by label, e.g. "1-15", "Current"). */
  bucketFilter?: string[];
  sortBy?: SortKey;
  sortDir?: SortDir;
};

/** Default statuses we consider "outstanding" for aging purposes.
 *  DRAFT / VOID / WRITTEN_OFF / PAID never show regardless of balance. */
const DEFAULT_OUTSTANDING_STATUSES: ReadonlySet<InvoiceStatus> = new Set<InvoiceStatus>([
  "SENT",
  "PARTIALLY_PAID",
  "OVERDUE",
]);

/** Convert an InvoiceStatus enum value to the title-cased label users see. */
function invoiceStatusLabel(s: InvoiceStatus): string {
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

/** Convert the CreditNote status string (OPEN/CLOSED/VOID) to a
 *  user-friendly label. */
function creditNoteStatusLabel(s: string): string {
  const u = (s || "").toUpperCase();
  if (u === "OPEN") return "Open";
  if (u === "CLOSED") return "Closed";
  if (u === "VOID") return "Void";
  return s;
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
  const overflowFloor = intervalCount * intervalSize + 1;
  return `${overflowFloor}+`;
}

/** Build the list of bucket labels in canonical order. */
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

/** Build the AR Aging Details rows from invoices + credit notes. */
export function computeArAgingDetails(
  input: ComputeArAgingDetailsInput
): ArAgingDetailRow[] {
  const {
    invoices,
    creditNotes = [],
    asOf,
    agingBy = "dueDate",
    intervalCount = 4,
    intervalSize = 15,
    customerId,
    entities = ["invoice"],
    statusFilter,
    amountMin,
    amountMax,
    bucketFilter,
    sortBy = "age",
    sortDir = "desc",
  } = input;

  const allowedStatuses: ReadonlySet<InvoiceStatus> = statusFilter && statusFilter.length > 0
    ? new Set(statusFilter)
    : DEFAULT_OUTSTANDING_STATUSES;

  const includeInvoices = entities.includes("invoice");
  const includeCreditNotes = entities.includes("creditnote");

  const rows: ArAgingDetailRow[] = [];

  if (includeInvoices) {
    for (const inv of invoices) {
      if (!allowedStatuses.has(inv.status)) continue;
      if (customerId && inv.contactId !== customerId) continue;
      const balanceDue = Number(inv.total) - Number(inv.amountPaid);
      if (balanceDue <= 0) continue;

      const ageFrom = agingBy === "dueDate" ? inv.dueDate : inv.issueDate;
      const age = daysBetween(asOf, ageFrom);
      const bucket = bucketForAge(age, intervalCount, intervalSize);

      const amount = Number(inv.total);
      if (amountMin != null && amount < amountMin) continue;
      if (amountMax != null && amount > amountMax) continue;
      if (bucketFilter && bucketFilter.length > 0 && !bucketFilter.includes(bucket)) continue;

      rows.push({
        rowId: inv.id,
        source: "invoice",
        date: isoDate(inv.issueDate),
        dueDate: isoDate(inv.dueDate),
        number: inv.number,
        type: "Invoice",
        status: invoiceStatusLabel(inv.status),
        customerId: inv.contactId,
        customerName: inv.contact.displayName,
        age,
        bucket,
        amount,
        balanceDue,
      });
    }
  }

  if (includeCreditNotes) {
    for (const cn of creditNotes) {
      // Only OPEN credit notes carry an unapplied balance.
      if ((cn.status || "").toUpperCase() !== "OPEN") continue;
      if (customerId && cn.contactId !== customerId) continue;
      const unapplied = Number(cn.total) - Number(cn.amountApplied) - Number(cn.amountRefunded);
      if (unapplied <= 0) continue;

      // Credit notes have no due date; age from the document date.
      const age = daysBetween(asOf, cn.date);
      const bucket = bucketForAge(age, intervalCount, intervalSize);

      // Credit notes reduce AR — display as negative.
      const amount = -Number(cn.total);
      if (amountMin != null && amount < amountMin) continue;
      if (amountMax != null && amount > amountMax) continue;
      if (bucketFilter && bucketFilter.length > 0 && !bucketFilter.includes(bucket)) continue;

      rows.push({
        rowId: cn.id,
        source: "creditnote",
        date: isoDate(cn.date),
        dueDate: isoDate(cn.date),
        number: cn.number,
        type: "Credit Note",
        status: creditNoteStatusLabel(cn.status),
        customerId: cn.contactId,
        customerName: cn.contact.displayName,
        age,
        bucket,
        amount,
        balanceDue: -unapplied,
      });
    }
  }

  // Sort with a deterministic tiebreaker on rowId so output is stable.
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
    return a.rowId.localeCompare(b.rowId);
  });

  return rows;
}

/** Group a flat row list into subtotalled buckets. When `groupBy` is
 *  "none" returns a single group with all rows. */
export function groupArAgingDetails(
  rows: ArAgingDetailRow[],
  groupBy: GroupBy,
  bucketOrder?: string[]
): ArAgingDetailGroup[] {
  if (groupBy === "none") {
    return [
      {
        groupKey: "all",
        groupLabel: "All",
        rows,
        subtotal: rows.reduce((s, r) => s + r.balanceDue, 0),
      },
    ];
  }

  const byKey = new Map<string, ArAgingDetailGroup>();

  for (const row of rows) {
    const key =
      groupBy === "customer" ? row.customerId :
      groupBy === "bucket" ? row.bucket :
      /* status */ row.status;
    const label =
      groupBy === "customer" ? row.customerName :
      groupBy === "bucket" ? row.bucket :
      row.status;

    if (!byKey.has(key)) {
      byKey.set(key, { groupKey: key, groupLabel: label, rows: [], subtotal: 0 });
    }
    const g = byKey.get(key)!;
    g.rows.push(row);
    g.subtotal += row.balanceDue;
  }

  const groups = Array.from(byKey.values());

  // Canonical group ordering:
  //   - bucket: Current → 1-15 → 16-30 → ... → 46+ (use bucketOrder if provided)
  //   - customer: alphabetical by customerName
  //   - status: alphabetical
  if (groupBy === "bucket" && bucketOrder && bucketOrder.length > 0) {
    const order = new Map(bucketOrder.map((b, i) => [b, i] as const));
    groups.sort((a, b) => {
      const ai = order.get(a.groupKey) ?? Number.MAX_SAFE_INTEGER;
      const bi = order.get(b.groupKey) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  } else {
    groups.sort((a, b) => a.groupLabel.localeCompare(b.groupLabel));
  }

  return groups;
}
