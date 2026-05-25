/**
 * RPT-CBS — Customer Balance Summary helper.
 *
 * For each customer, shows the cumulative state as of a chosen date:
 *   - Invoiced Amount  (sum of `total` across all non-DRAFT, non-VOID
 *     invoices with issueDate <= asOf)
 *   - Amount Received  (sum of `amountPaid` across the same invoices)
 *   - Closing Balance  (Invoiced Amount - Amount Received)
 *
 * Columns match Zoho Books' Customer Balance Summary report exactly
 * per docs/zoho-reports.yaml:
 *   - Customer Name
 *   - Invoiced Amount
 *   - Amount Received
 *   - Closing Balance
 *
 * Pure function — caller queries the DB and passes raw invoice rows
 * with the customer relation joined.
 */

export interface InvoiceForCustomerBalance {
  contactId: string;
  total: number;
  amountPaid: number;
  status: string;
  contact: {
    id: string;
    name: string;
  };
}

export interface CustomerBalanceRow {
  // Index signature so this row type is assignable to ListReportTemplate's
  // `Record<string, unknown>` generic constraint.
  [key: string]: unknown;
  customerId: string;
  customerName: string;
  invoicedAmount: number;
  amountReceived: number;
  closingBalance: number;
}

export interface CustomerBalanceSummary {
  rows: CustomerBalanceRow[];
  totalInvoiced: number;
  totalReceived: number;
  totalBalance: number;
  customerCount: number;
}

/**
 * Build the Customer Balance Summary view.
 *
 * Excludes DRAFT and VOID invoices (those don't represent real
 * receivables). Caller should also pre-filter to `issueDate <= asOf`.
 *
 * @param invoices Raw invoice rows with contact joined.
 * @param opts Optional flags:
 *   - excludeZeroBalance: when true, customers with closing balance
 *     of 0 are omitted (matches Zoho's "Exclude customers with zero
 *     closing balance" toggle).
 *
 * Rows sorted by customerName ascending (matches Zoho's default).
 */
export function buildCustomerBalanceSummary(
  invoices: InvoiceForCustomerBalance[],
  opts: { excludeZeroBalance?: boolean } = {},
): CustomerBalanceSummary {
  const byCustomer = new Map<string, CustomerBalanceRow>();

  for (const inv of invoices) {
    if (inv.status === "DRAFT" || inv.status === "VOID") continue;

    const existing = byCustomer.get(inv.contactId);
    if (existing) {
      existing.invoicedAmount = round(existing.invoicedAmount + inv.total);
      existing.amountReceived = round(existing.amountReceived + inv.amountPaid);
      existing.closingBalance = round(
        existing.invoicedAmount - existing.amountReceived,
      );
    } else {
      const invoicedAmount = round(inv.total);
      const amountReceived = round(inv.amountPaid);
      byCustomer.set(inv.contactId, {
        customerId: inv.contact.id,
        customerName: inv.contact.name,
        invoicedAmount,
        amountReceived,
        closingBalance: round(invoicedAmount - amountReceived),
      });
    }
  }

  let rows = Array.from(byCustomer.values());
  if (opts.excludeZeroBalance) {
    rows = rows.filter((r) => Math.abs(r.closingBalance) > 0.005);
  }
  rows.sort((a, b) => a.customerName.localeCompare(b.customerName));

  const totalInvoiced = round(rows.reduce((s, r) => s + r.invoicedAmount, 0));
  const totalReceived = round(rows.reduce((s, r) => s + r.amountReceived, 0));
  const totalBalance = round(rows.reduce((s, r) => s + r.closingBalance, 0));

  return {
    rows,
    totalInvoiced,
    totalReceived,
    totalBalance,
    customerCount: rows.length,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
