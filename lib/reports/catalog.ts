/**
 * REPORTS-CENTER — Static catalog of every report shown in
 * `/reports` (the Reports Center).
 *
 * Each entry is one row of the All Reports table. `available: true`
 * means we've built a real route for it — clicking the name lands
 * on that route. `available: false` is a stub row rendered grayed
 * out with a "Coming soon" badge — the count badge ("All Reports
 * 80") still includes it so the page matches the reference.
 *
 * Adding a new report = append one entry here. No migration needed,
 * favorites + filters key off `reportKey` which is a free-form string.
 *
 * Categories follow the reference design exactly — 15 categories, ordered the
 * same way they appear in the reference left sidebar.
 *
 * The 80 reports below match the screenshots the user shared on
 * 2026-05-14 turn-by-turn. Internal routes that exist in the app
 * but aren't in this catalog (/reports/tax-summary, /reports/gstr1,
 * /reports/stock-valuation) still work as direct URLs but won't
 * surface in the table — they're kept alive for any external link
 * that points at them.
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
 * The catalog. Order inside a category follows the canonical display
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
    available: true,
    href: "/reports/profit-loss-schedule-iii",
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
    available: true,
    href: "/reports/balance-sheet-schedule-iii",
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
    available: true,
    href: "/reports/sales-by-customer",
  },
  {
    key: "sales-by-item",
    name: "Sales by Item",
    category: "Sales",
    available: true,
    href: "/reports/sales-by-item",
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
    available: true,
    href: "/reports/ar-aging-details",
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
    available: true,
    href: "/reports/customer-balance-summary",
  },
  {
    key: "receivables-summary",
    name: "Receivables Summary",
    category: "Receivables",
    available: true,
    href: "/reports/receivables-summary",
  },
  {
    key: "receivable-details",
    name: "Receivable Details",
    category: "Receivables",
    available: false,
  },

  // ─── Payments Received (4) ─────────────────────────────────────
  {
    key: "payments-received",
    name: "Payments Received",
    category: "Payments Received",
    available: true,
    href: "/reports/payments-received",
  },
  {
    key: "time-to-get-paid",
    name: "Time to Get Paid",
    category: "Payments Received",
    available: false,
  },
  {
    key: "credit-note-details",
    name: "Credit Note Details",
    category: "Payments Received",
    available: false,
  },
  {
    key: "refund-history-payments-received",
    name: "Refund History",
    category: "Payments Received",
    available: false,
  },

  // ─── Recurring Invoices (1) ────────────────────────────────────
  {
    key: "recurring-invoice-details",
    name: "Recurring Invoice Details",
    category: "Recurring Invoices",
    available: false,
  },

  // ─── Payables (11) ─────────────────────────────────────────────
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
    key: "vendor-balance-summary",
    name: "Vendor Balance Summary",
    category: "Payables",
    available: false,
  },
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
    key: "vendor-credit-details",
    name: "Vendor Credit Details",
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
    key: "refund-history-payables",
    name: "Refund History",
    category: "Payables",
    available: false,
  },
  {
    key: "purchase-order-details",
    name: "Purchase Order Details",
    category: "Payables",
    available: false,
  },
  {
    key: "purchase-orders-by-vendor",
    name: "Purchase Orders by Vendor",
    category: "Payables",
    available: false,
  },

  // ─── Purchases and Expenses (8) ────────────────────────────────
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
    key: "expenses-by-customer",
    name: "Expenses by Customer",
    category: "Purchases and Expenses",
    available: false,
  },
  {
    key: "expenses-by-project",
    name: "Expenses by Project",
    category: "Purchases and Expenses",
    available: false,
  },
  {
    key: "expenses-by-employee",
    name: "Expenses by Employee",
    category: "Purchases and Expenses",
    available: false,
  },
  {
    key: "billable-expense-details",
    name: "Billable Expense Details",
    category: "Purchases and Expenses",
    available: false,
  },

  // ─── Taxes (3) ─────────────────────────────────────────────────
  {
    key: "tds-summary",
    name: "TDS Summary",
    category: "Taxes",
    available: false,
  },
  {
    key: "tds-receivable-summary",
    name: "TDS Receivable Summary",
    category: "Taxes",
    available: false,
  },
  {
    key: "tcs-payable-summary-form-27eq",
    name: "TCS Payable Summary (Form No. 27EQ)",
    category: "Taxes",
    available: false,
  },

  // ─── Banking (1) ───────────────────────────────────────────────
  {
    key: "reconciliation-status",
    name: "Reconciliation Status",
    category: "Banking",
    available: false,
  },

  // ─── Projects and Timesheet (7) ────────────────────────────────
  {
    key: "timesheet-details",
    name: "Timesheet Details",
    category: "Projects and Timesheet",
    available: false,
  },
  {
    key: "timesheet-profitability-summary",
    name: "Timesheet Profitability Summary",
    category: "Projects and Timesheet",
    available: false,
  },
  {
    key: "project-summary",
    name: "Project Summary",
    category: "Projects and Timesheet",
    available: false,
  },
  {
    key: "project-details",
    name: "Project Details",
    category: "Projects and Timesheet",
    available: false,
  },
  {
    key: "projects-cost-summary",
    name: "Projects Cost Summary",
    category: "Projects and Timesheet",
    available: false,
  },
  {
    key: "projects-revenue-summary",
    name: "Projects Revenue Summary",
    category: "Projects and Timesheet",
    available: false,
  },
  {
    key: "projects-performance-summary",
    name: "Projects Performance Summary",
    category: "Projects and Timesheet",
    available: false,
  },

  // ─── Accountant (8) ────────────────────────────────────────────
  {
    key: "general-ledger",
    name: "General Ledger",
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
    key: "journal-report",
    name: "Journal Report",
    category: "Accountant",
    available: false,
  },
  {
    key: "trial-balance",
    name: "Trial Balance",
    category: "Accountant",
    available: true,
    href: "/reports/trial-balance",
  },
  {
    key: "account-transactions",
    name: "Account Transactions",
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
    key: "account-type-transactions",
    name: "Account Type Transactions",
    category: "Accountant",
    available: false,
  },
  {
    key: "day-book",
    name: "Day Book",
    category: "Accountant",
    available: false,
  },

  // ─── Budgets (1) ───────────────────────────────────────────────
  {
    key: "budget-vs-actuals",
    name: "Budget Vs Actuals",
    category: "Budgets",
    available: false,
  },

  // ─── Currency (2) ──────────────────────────────────────────────
  {
    key: "realized-gain-or-loss",
    name: "Realized Gain or Loss",
    category: "Currency",
    available: false,
  },
  {
    key: "unrealized-gain-or-loss",
    name: "Unrealized Gain or Loss",
    category: "Currency",
    available: false,
  },

  // ─── Activity (7) ──────────────────────────────────────────────
  {
    key: "system-mails",
    name: "System Mails",
    category: "Activity",
    available: false,
  },
  {
    key: "activity-logs-audit-trail",
    name: "Activity Logs & Audit Trail",
    category: "Activity",
    available: false,
  },
  {
    key: "exception-report",
    name: "Exception Report",
    category: "Activity",
    available: false,
  },
  {
    key: "portal-activities",
    name: "Portal Activities",
    category: "Activity",
    available: false,
  },
  {
    key: "customer-reviews",
    name: "Customer Reviews",
    category: "Activity",
    available: false,
  },
  {
    key: "api-usage",
    name: "API Usage",
    category: "Activity",
    available: false,
  },
  {
    key: "pending-inventory-valuations",
    name: "Pending Inventory Valuations",
    category: "Activity",
    available: false,
  },

  // ─── Automation (3) ────────────────────────────────────────────
  {
    key: "scheduled-date-based-workflow-rules",
    name: "Scheduled Date Based Workflow Rules",
    category: "Automation",
    available: false,
  },
  {
    key: "scheduled-time-based-workflow-actions",
    name: "Scheduled Time Based Workflow Actions",
    category: "Automation",
    available: false,
  },
  {
    key: "workflow-execution-logs",
    name: "Workflow Execution Logs",
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
