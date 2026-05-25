/**
 * RPT-SBC — Sales by Customer helper.
 *
 * Aggregates invoices in a date range by customer, producing one row
 * per customer with: invoice count, gross sales, total paid, balance.
 * Sorted by gross sales descending so the most-valuable customers
 * surface first.
 *
 * Pure function — caller queries the DB and passes raw invoice rows.
 */

export interface InvoiceForSalesByCustomer {
  id: string;
  contactId: string;
  total: number;
  amountPaid: number;
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
  grossSales: number;
  amountPaid: number;
  balanceDue: number;
}

export interface SalesByCustomerSummary {
  rows: SalesByCustomerRow[];
  totalGross: number;
  totalPaid: number;
  totalBalance: number;
  customerCount: number;
}

/**
 * Build the Sales by Customer view.
 *
 * Excludes DRAFT and VOID invoices (those don't represent actual sales).
 * Rows sorted by grossSales descending; ties broken by customerName asc.
 */
export function buildSalesByCustomer(
  invoices: InvoiceForSalesByCustomer[],
): SalesByCustomerSummary {
  const byCustomer = new Map<string, SalesByCustomerRow>();

  for (const inv of invoices) {
    // Skip DRAFT and VOID — not real sales.
    if (inv.status === "DRAFT" || inv.status === "VOID") continue;

    const existing = byCustomer.get(inv.contactId);
    if (existing) {
      existing.invoiceCount += 1;
      existing.grossSales = round(existing.grossSales + inv.total);
      existing.amountPaid = round(existing.amountPaid + inv.amountPaid);
      existing.balanceDue = round(existing.grossSales - existing.amountPaid);
    } else {
      const grossSales = round(inv.total);
      const amountPaid = round(inv.amountPaid);
      byCustomer.set(inv.contactId, {
        customerId: inv.contact.id,
        customerName: inv.contact.name,
        invoiceCount: 1,
        grossSales,
        amountPaid,
        balanceDue: round(grossSales - amountPaid),
      });
    }
  }

  const rows = Array.from(byCustomer.values()).sort((a, b) => {
    if (b.grossSales !== a.grossSales) return b.grossSales - a.grossSales;
    return a.customerName.localeCompare(b.customerName);
  });

  const totalGross = round(rows.reduce((s, r) => s + r.grossSales, 0));
  const totalPaid = round(rows.reduce((s, r) => s + r.amountPaid, 0));
  const totalBalance = round(rows.reduce((s, r) => s + r.balanceDue, 0));

  return {
    rows,
    totalGross,
    totalPaid,
    totalBalance,
    customerCount: rows.length,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
