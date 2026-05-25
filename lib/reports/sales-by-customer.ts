/**
 * RPT-SBC — Sales by Customer helper.
 *
 * Aggregates invoices in a date range by customer, producing one row
 * per customer with: invoice count, Sales (pre-tax), Sales With Tax (total).
 *
 * Columns match Zoho Books' Sales by Customer report exactly per
 * `docs/zoho-reports.yaml`:
 *   - Name
 *   - Invoice Count
 *   - Sales              (= total - taxTotal, the pre-GST taxable value)
 *   - Sales With Tax     (= total, including all taxes)
 *
 * Earlier versions exposed `amountPaid` + `balanceDue` columns here —
 * those moved to Customer Balance Summary where they semantically
 * belong. Sales by Customer is purely about top-line revenue.
 *
 * Pure function — caller queries the DB and passes raw invoice rows.
 */

export interface InvoiceForSalesByCustomer {
  id: string;
  contactId: string;
  total: number;
  taxTotal: number;
  status: string;
  contact: {
    id: string;
    name: string;
  };
}

export interface SalesByCustomerRow {
  // Index signature so this row type is assignable to ListReportTemplate's
  // `Record<string, unknown>` generic constraint.
  [key: string]: unknown;
  customerId: string;
  customerName: string;
  invoiceCount: number;
  /** Pre-tax revenue (total - taxTotal). */
  sales: number;
  /** Total invoice value including taxes. */
  salesWithTax: number;
}

export interface SalesByCustomerSummary {
  rows: SalesByCustomerRow[];
  totalSales: number;
  totalSalesWithTax: number;
  customerCount: number;
}

/**
 * Build the Sales by Customer view.
 *
 * Excludes DRAFT and VOID invoices (those don't represent actual sales).
 * Rows sorted by salesWithTax descending; ties broken by customerName asc.
 */
export function buildSalesByCustomer(
  invoices: InvoiceForSalesByCustomer[],
): SalesByCustomerSummary {
  const byCustomer = new Map<string, SalesByCustomerRow>();

  for (const inv of invoices) {
    // Skip DRAFT and VOID — not real sales.
    if (inv.status === "DRAFT" || inv.status === "VOID") continue;

    const lineSalesWithTax = round(inv.total);
    const lineSales = round(inv.total - inv.taxTotal);

    const existing = byCustomer.get(inv.contactId);
    if (existing) {
      existing.invoiceCount += 1;
      existing.sales = round(existing.sales + lineSales);
      existing.salesWithTax = round(existing.salesWithTax + lineSalesWithTax);
    } else {
      byCustomer.set(inv.contactId, {
        customerId: inv.contact.id,
        customerName: inv.contact.name,
        invoiceCount: 1,
        sales: lineSales,
        salesWithTax: lineSalesWithTax,
      });
    }
  }

  const rows = Array.from(byCustomer.values()).sort((a, b) => {
    if (b.salesWithTax !== a.salesWithTax)
      return b.salesWithTax - a.salesWithTax;
    return a.customerName.localeCompare(b.customerName);
  });

  const totalSales = round(rows.reduce((s, r) => s + r.sales, 0));
  const totalSalesWithTax = round(
    rows.reduce((s, r) => s + r.salesWithTax, 0),
  );

  return {
    rows,
    totalSales,
    totalSalesWithTax,
    customerCount: rows.length,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
