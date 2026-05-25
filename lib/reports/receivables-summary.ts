/**
 * RPT-RECV — Receivables Summary helper.
 *
 * Lists every open invoice (status in SENT / PARTIALLY_PAID / OVERDUE)
 * with a positive balance due, plus per-customer summary stats. The
 * page table is one row per invoice; an optional groupBy="customerName"
 * variant collapses to one section per customer.
 *
 * Pure function — caller supplies the raw Prisma rows + the current
 * "as of" Date so we can compute age-in-days.
 */

export interface InvoiceWithCustomer {
  id: string;
  number: string;
  issueDate: Date;
  dueDate: Date;
  total: number;
  amountPaid: number;
  status: string; // matches Prisma's InvoiceStatus enum at runtime
  contact: {
    id: string;
    name: string;
  };
}

export interface ReceivablesSummaryRow {
  // Index signature so the row type is assignable to the
  // `Record<string, unknown>` constraint on `<ListReportTemplate>`'s
  // generic `TRow`. Keeping the specific keys below for autocomplete.
  [key: string]: unknown;
  invoiceId: string;
  customerId: string;
  customerName: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  total: number;
  amountPaid: number;
  balanceDue: number;
  /** Days between dueDate and asOf, clamped at 0. Positive = overdue. */
  ageDays: number;
  status: string;
}

export interface ReceivablesSummary {
  rows: ReceivablesSummaryRow[];
  totalOutstanding: number;
  invoiceCount: number;
}

/**
 * Build the receivables summary view from raw invoice rows.
 *
 * Input contract:
 *   - Caller has already filtered to only OPEN invoices (status SENT /
 *     PARTIALLY_PAID / OVERDUE) AND `issueDate <= asOf` AND
 *     `total - amountPaid > 0`. We re-check the balance-due filter
 *     defensively but don't query the DB.
 *   - Caller has joined the contact for the customer name.
 *
 * Output rows are sorted by customerName, then dueDate ascending.
 */
export function buildReceivablesSummary(
  invoices: InvoiceWithCustomer[],
  asOf: Date,
): ReceivablesSummary {
  const asOfMs = asOf.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  const rows: ReceivablesSummaryRow[] = [];
  for (const inv of invoices) {
    const balanceDue = round(inv.total - inv.amountPaid);
    if (balanceDue <= 0) continue;
    const ageDays = Math.max(
      0,
      Math.floor((asOfMs - inv.dueDate.getTime()) / dayMs),
    );
    rows.push({
      invoiceId: inv.id,
      customerId: inv.contact.id,
      customerName: inv.contact.name,
      invoiceNumber: inv.number,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      total: round(inv.total),
      amountPaid: round(inv.amountPaid),
      balanceDue,
      ageDays,
      status: inv.status,
    });
  }

  rows.sort((a, b) => {
    const c = a.customerName.localeCompare(b.customerName);
    if (c !== 0) return c;
    return a.dueDate.getTime() - b.dueDate.getTime();
  });

  const totalOutstanding = rows.reduce((s, r) => s + r.balanceDue, 0);

  return {
    rows,
    totalOutstanding: round(totalOutstanding),
    invoiceCount: rows.length,
  };
}

/** Round to 2 decimals to avoid floating-point fuzz in totals. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
