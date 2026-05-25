/**
 * RPT-PR — Payments Received helper.
 *
 * Lists every customer payment within a date range, sorted by date
 * descending. Pure function — caller queries the DB and passes raw
 * payment rows.
 */

export interface PaymentReceivedInput {
  id: string;
  number: string;
  paymentDate: Date;
  amount: number;
  paymentMode: string | null;
  reference: string | null;
  contact: {
    id: string;
    name: string;
  };
}

export interface PaymentReceivedRow {
  // Index signature so this row type is assignable to ListReportTemplate's
  // `Record<string, unknown>` generic constraint. Keep specific keys
  // below for autocomplete.
  [key: string]: unknown;
  paymentId: string;
  paymentNumber: string;
  paymentDate: Date;
  customerId: string;
  customerName: string;
  paymentMode: string;
  reference: string;
  amount: number;
}

export interface PaymentsReceivedSummary {
  rows: PaymentReceivedRow[];
  totalAmount: number;
  paymentCount: number;
}

/**
 * Build the Payments Received view from raw payment rows.
 *
 * Output rows are sorted by paymentDate descending (most recent first),
 * then by paymentNumber as a tie-breaker.
 */
export function buildPaymentsReceived(
  payments: PaymentReceivedInput[],
): PaymentsReceivedSummary {
  const rows: PaymentReceivedRow[] = payments.map((p) => ({
    paymentId: p.id,
    paymentNumber: p.number,
    paymentDate: p.paymentDate,
    customerId: p.contact.id,
    customerName: p.contact.name,
    paymentMode: humanizeMode(p.paymentMode),
    reference: p.reference ?? "",
    amount: round(p.amount),
  }));

  rows.sort((a, b) => {
    const d = b.paymentDate.getTime() - a.paymentDate.getTime();
    if (d !== 0) return d;
    return a.paymentNumber.localeCompare(b.paymentNumber);
  });

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);

  return {
    rows,
    totalAmount: round(totalAmount),
    paymentCount: rows.length,
  };
}

/** Display label for paymentMode — humanises snake_case. */
function humanizeMode(mode: string | null): string {
  if (!mode) return "—";
  switch (mode) {
    case "cash":
      return "Cash";
    case "bank_transfer":
      return "Bank Transfer";
    case "cheque":
      return "Cheque";
    case "credit_card":
      return "Credit Card";
    case "upi":
      return "UPI";
    default:
      return mode
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
