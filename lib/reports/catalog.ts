/**
 * REPORTS-CENTER — Static catalog of every report shown in
 * `/reports` (the Zoho-parity Reports Center).
 *
 * Each entry is one row of the All Reports table. `available: true`
 * means we've built a real route for it — clicking the name lands
 * on that route. `available: false` is a stub row rendered grayed
 * out with a "Coming soon" badge — the count badge ("All Reports
 * 80") still includes it so the page matches Zoho.
 *
 * Adding a new report = append one entry here. No migration needed,
 * favorites + filters key off `reportKey` which is a free-form string.
 *
 * Categories follow Zoho Books exactly — 15 categories, ordered the
 * same way they appear in Zoho's left sidebar.
 */

export const REPORT_CATEGORIES = [
  "Business Overview",
  "Sales",
  "Receivables",
  "Payments Received",
  "Recurring Invoices",
  "Payables",
  "Purchases and Expenses",
  "Taxes",
  "Banking",
  "Projects and Timesheet",
  "Accountant",
  "Budgets",
  "Currency",
  "Activity",
  "Automation",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export type ReportEntry = {
  /** Stable identifier — used in favorites table + URL params. */
  key: string;
  /** Display name shown in the table. */
  name: string;
  category: ReportCategory;
  /** True when we've actually built this report. */
  available: boolean;
  /** Where the row links to (only set when `available`). */
  href?: string;
};

/**
 * The catalog. Order inside a category follows Zoho's display
 * order. Available entries map to existing routes; the rest are
 * stubs.
 */
export const REPORTS: ReadonlyArray<ReportEntry> = [
  // ─── Business Overview (10) ────────────────────────────────────
  {
    key: "profit-and-loss",
    name: "Profit and Loss",
    category: "Business Overview",
    available: true,
    href: "/reports/profit-loss",
  },
  {
    key: "profit-and-loss-schedule-iii",
    name: "Profit and Loss (Schedule III)",
    category: "Business Overview",
    available: false,
  },
  {
    key: "horizontal-profit-and-loss",
    name: "Horizontal Profit and Loss",
    category: "Business Overview",
    available: false,
  },
  {
    key: "cash-flow-statement",
    name: "Cash Flow Statement",
    category: "Business Overview",
    available: true,
    href: "/reports/cash-flow",
  },
  {
    key: "balance-sheet",
    name: "Balance Sheet",
    category: "Business Overview",
    available: true,
    href: "/reports/balance-sheet",
  },
  {
    key: "horizontal-balance-sheet",
    name: "Horizontal Balance Sheet",
    category: "Business Overview",
    available: false,
  },
  {
    key: "balance-sheet-schedule-iii",
    name: "Balance Sheet (Schedule III)",
    category: "Business Overview",
    available: false,
  },
  {
    key: "business-performance-ratios",
    name: "Business Performance Ratios",
    category: "Business Overview",
    available: false,
  },
  {
    key: "cash-flow-forecasting",
    name: "Cash Flow Forecasting",
    category: "Business Overview",
    available: false,
  },
  {
    key: "movement-of-equity",
    name: "Movement of Equity",
    category: "Business Overview",
    available: false,
  },

  // ─── Sales (5) ─────────────────────────────────────────────────
  {
    key: "sales-by-customer",
    name: "Sales by Customer",
    category: "Sales",
    available: false,
  },
  {
    key: "sales-by-item",
    name: "Sales by Item",
    category: "Sales",
    available: false,
  },
  {
    key: "sales-by-sales-person",
    name: "Sales by Sales Person",
    category: "Sales",
    available: false,
  },
  {
    key: "sales-summary",
    name: "Sales Summary",
    category: "Sales",
    available: true,
    href: "/reports/sales-summary",
  },
  {
    key: "sales-channel-integrations-sync-summary",
    name: "Sales Channel Integrations Sync Summary",
    category: "Sales",
    available: false,
  },

  // ─── Receivables (9) ───────────────────────────────────────────
  {
    key: "ar-aging-summary",
    name: "AR Aging Summary",
    category: "Receivables",
    available: true,
    href: "/reports/ar-aging",
  },
  {
    key: "ar-aging-details",
    name: "AR Aging Details",
    category: "Receivables",
    available: false,
  },
  {
    key: "invoice-details",
    name: "Invoice Details",
    category: "Receivables",
    available: false,
  },
  {
    key: "sales-order-details",
    name: "Sales Order Details",
    category: "Receivables",
    available: false,
  },
  {
    key: "delivery-challan-details",
    name: "Delivery Challan Details",
    category: "Receivables",
    available: false,
  },
  {
    key: "quote-details",
    name: "Quote Details",
    category: "Receivables",
    available: false,
  },
  {
    key: "customer-balance-summary",
    name: "Customer Balance Summary",
    category: "Receivables",
    available: false,
  },
  {
    key: "receivable-summary",
    name: "Receivable Summary",
    category: "Receivables",
    available: false,
  },
  {
    key: "receivable-details",
    name: "Receivable Details",
    category: "Receivables",
    available: false,
  },

  // ─── Payments Received (3) ─────────────────────────────────────
  {
    key: "payments-received",
    name: "Payments Received",
    category: "Payments Received",
    available: false,
  },
  {
    key: "time-to-get-paid",
    name: "Time to Get Paid",
    category: "Payments Received",
    available: false,
  },
  {
    key: "refund-history",
    name: "Refund History",
    category: "Payments Received",
    available: false,
  },

  // ─── Recurring Invoices (2) ────────────────────────────────────
  {
    key: "recurring-invoice-details",
    name: "Recurring Invoice Details",
    category: "Recurring Invoices",
    available: false,
  },
  {
    key: "projected-revenue",
    name: "Projected Revenue",
    category: "Recurring Invoices",
    available: false,
  },

  // ─── Payables (8) ──────────────────────────────────────────────
  {
    key: "ap-aging-summary",
    name: "AP Aging Summary",
    category: "Payables",
    available: true,
    href: "/reports/ap-aging",
  },
  {
    key: "ap-aging-details",
    name: "AP Aging Details",
    category: "Payables",
    available: false,
  },
  {
    key: "bill-details",
    name: "Bill Details",
    category: "Payables",
    available: false,
  },
  {
    key: "vendor-balance-summary",
    name: "Vendor Balance Summary",
    category: "Payables",
    available: false,
  },
  {
    key: "payable-summary",
    name: "Payable Summary",
    category: "Payables",
    available: false,
  },
  {
    key: "payable-details",
    name: "Payable Details",
    category: "Payables",
    available: false,
  },
  {
    key: "payments-made",
    name: "Payments Made",
    category: "Payables",
    available: false,
  },
  {
    key: "vendor-credits-details",
    name: "Vendor Credits Details",
    category: "Payables",
    available: false,
  },

  // ─── Purchases and Expenses (7) ────────────────────────────────
  {
    key: "purchases-by-vendor",
    name: "Purchases by Vendor",
    category: "Purchases and Expenses",
    available: false,
  },
  {
    key: "purchases-by-item",
    name: "Purchases by Item",
    category: "Purchases and Expenses",
    available: false,
  },
  {
    key: "purchase-order-details",
    name: "Purchase Order Details",
    category: "Purchases and Expenses",
    available: false,
  },
  {
    key: "purchase-order-by-vendor",
    name: "Purchase Order by Vendor",
    category: "Purchases and Expenses",
    available: false,
  },
  {
    key: "expense-details",
    name: "Expense Details",
    category: "Purchases and Expenses",
    available: false,
  },
  {
    key: "expenses-by-category",
    name: "Expenses by Category",
    category: "Purchases and Expenses",
    available: false,
  },
  {
    key: "billable-expense-details",
    name: "Billable Expense Details",
    category: "Purchases and Expenses",
    available: false,
  },

  // ─── Taxes (6) ─────────────────────────────────────────────────
  {
    key: "tax-summary",
    name: "Tax Summary",
    category: "Taxes",
    available: true,
    href: "/reports/tax-summary",
  },
  {
    key: "gstr-1",
    name: "GSTR-1",
    category: "Taxes",
    available: true,
    href: "/reports/gstr1",
  },
  {
    key: "gstr-2a-2b",
    name: "GSTR-2A / 2B",
    category: "Taxes",
    available: false,
  },
  {
    key: "gstr-3b",
    name: "GSTR-3B",
    category: "Taxes",
    available: false,
  },
  {
    key: "tds-summary",
    name: "TDS Summary",
    category: "Taxes",
    available: false,
  },
  {
    key: "tcs-summary",
    name: "TCS Summary",
    category: "Taxes",
    available: false,
  },

  // ─── Banking (4) ───────────────────────────────────────────────
  {
    key: "account-transactions",
    name: "Account Transactions",
    category: "Banking",
    available: false,
  },
  {
    key: "bank-reconciliation-statement",
    name: "Bank Reconciliation Statement",
    category: "Banking",
    available: false,
  },
  {
    key: "uncategorised-transactions",
    name: "Uncategorised Transactions",
    category: "Banking",
    available: false,
  },
  {
    key: "matched-transactions",
    name: "Matched Transactions",
    category: "Banking",
    available: false,
  },

  // ─── Projects and Timesheet (5) ────────────────────────────────
  {
    key: "project-profitability",
    name: "Project Profitability",
    category: "Projects and Timesheet",
    available: false,
  },
  {
    key: "time-entry-details",
    name: "Time Entry Details",
    category: "Projects and Timesheet",
    available: false,
  },
  {
    key: "timesheet-summary",
    name: "Timesheet Summary",
    category: "Projects and Timesheet",
    available: false,
  },
  {
    key: "project-budget-vs-actuals",
    name: "Project Budget vs Actuals",
    category: "Projects and Timesheet",
    available: false,
  },
  {
    key: "unbilled-time",
    name: "Unbilled Time",
    category: "Projects and Timesheet",
    available: false,
  },

  // ─── Accountant (10) ───────────────────────────────────────────
  {
    key: "trial-balance",
    name: "Trial Balance",
    category: "Accountant",
    available: true,
    href: "/reports/trial-balance",
  },
  {
    key: "general-ledger",
    name: "General Ledger",
    category: "Accountant",
    available: false,
  },
  {
    key: "journal-report",
    name: "Journal Report",
    category: "Accountant",
    available: false,
  },
  {
    key: "account-type-summary",
    name: "Account Type Summary",
    category: "Accountant",
    available: false,
  },
  {
    key: "account-transactions-accountant",
    name: "Account Transactions",
    category: "Accountant",
    available: false,
  },
  {
    key: "detailed-general-ledger",
    name: "Detailed General Ledger",
    category: "Accountant",
    available: false,
  },
  {
    key: "manual-journals-report",
    name: "Manual Journals",
    category: "Accountant",
    available: false,
  },
  {
    key: "depreciation-schedule",
    name: "Depreciation Schedule",
    category: "Accountant",
    available: false,
  },
  {
    key: "stock-valuation",
    name: "Stock Valuation",
    category: "Accountant",
    available: true,
    href: "/reports/stock-valuation",
  },
  {
    key: "fixed-asset-summary",
    name: "Fixed Asset Summary",
    category: "Accountant",
    available: false,
  },

  // ─── Budgets (2) ───────────────────────────────────────────────
  {
    key: "budget-vs-actuals",
    name: "Budget vs Actuals",
    category: "Budgets",
    available: false,
  },
  {
    key: "monthly-budget-variance",
    name: "Monthly Budget Variance",
    category: "Budgets",
    available: false,
  },

  // ─── Currency (3) ──────────────────────────────────────────────
  {
    key: "realised-gain-loss",
    name: "Realised Gain or Loss",
    category: "Currency",
    available: false,
  },
  {
    key: "unrealised-gain-loss",
    name: "Unrealised Gain or Loss",
    category: "Currency",
    available: false,
  },
  {
    key: "currency-exchange-history",
    name: "Currency Exchange History",
    category: "Currency",
    available: false,
  },

  // ─── Activity (3) ──────────────────────────────────────────────
  {
    key: "user-log",
    name: "User Log",
    category: "Activity",
    available: false,
  },
  {
    key: "activity-log",
    name: "Activity Log",
    category: "Activity",
    available: false,
  },
  {
    key: "audit-trail",
    name: "Audit Trail",
    category: "Activity",
    available: false,
  },

  // ─── Automation (3) ────────────────────────────────────────────
  {
    key: "workflow-rules-log",
    name: "Workflow Rules Log",
    category: "Automation",
    available: false,
  },
  {
    key: "email-history",
    name: "Email History",
    category: "Automation",
    available: false,
  },
  {
    key: "scheduled-reports-log",
    name: "Scheduled Reports Log",
    category: "Automation",
    available: false,
  },
] as const;

/** Total number of reports — surfaced in the "All Reports (N)" badge. */
export const REPORT_COUNT = REPORTS.length;

/** Group reports by category, preserving entry order. */
export function reportsByCategory(): Record<ReportCategory, ReportEntry[]> {
  const out = Object.fromEntries(
    REPORT_CATEGORIES.map((c) => [c, [] as ReportEntry[]])
  ) as Record<ReportCategory, ReportEntry[]>;
  for (const r of REPORTS) out[r.category].push(r);
  return out;
}

/** Lookup one report by key (used by toggle action validation). */
export function findReport(key: string): ReportEntry | undefined {
  return REPORTS.find((r) => r.key === key);
}
