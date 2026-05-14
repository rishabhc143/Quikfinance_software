import type { AccountType } from "@prisma/client";

/**
 * ACCT-E — Zoho-parity default Chart of Accounts.
 *
 * The 60+ accounts a fresh Zoho Books org sees on first visit to
 * Chart of Accounts → Active Accounts. Each row carries:
 *
 *   - `name`        — display name (matches Zoho exactly)
 *   - `type`        — one of our 8 AccountType enum variants
 *   - `subType`     — Zoho's granular label (e.g. "Other Current
 *                     Asset", "Fixed Asset", "Stock"); rendered
 *                     when set, otherwise the broad type label
 *                     wins
 *   - `locked`      — when true, the UI shows a lock icon + the
 *                     account can't be archived or renamed.
 *                     Mirrors Zoho's locked rows.
 *   - `description` — short one-liner used on the detail page
 *
 * Five names collide with our SYS-* lazy-created accounts and are
 * omitted here so we don't seed duplicates:
 *
 *   Accounts Receivable      → SYS-AR
 *   Accounts Payable         → SYS-AP
 *   Sales                    → SYS-REV
 *   Bad Debt                 → SYS-BAD
 *   Exchange Gain or Loss    → split across SYS-FX-GAIN + SYS-FX-LOSS
 *
 * If/when an org actually triggers one of those flows (posts an
 * invoice, runs a write-off, runs a currency adjustment), the
 * system-account lazy-create kicks in and adds the row. The
 * default seed handles everything else.
 *
 * Pure module — no Prisma, no DB. The seeder in
 * `lib/accounting/seed-default-coa.ts` does the createMany.
 */

export type DefaultAccountSpec = {
  name: string;
  type: AccountType;
  subType: string | null;
  description?: string;
  locked?: boolean;
};

export const DEFAULT_ACCOUNTS: DefaultAccountSpec[] = [
  // ──────────────── ASSET ────────────────

  // Other Current Asset
  {
    name: "Employee Advance",
    type: "ASSET",
    subType: "Other Current Asset",
    locked: true,
    description: "Advances paid to employees against future expense claims.",
  },
  {
    name: "Prepaid Expenses",
    type: "ASSET",
    subType: "Other Current Asset",
    description: "Payments made in advance for goods or services not yet received.",
  },
  {
    name: "TDS Receivable",
    type: "ASSET",
    subType: "Other Current Asset",
    description: "Tax Deducted at Source by customers, recoverable from the tax authority.",
  },
  {
    name: "Advance Tax",
    type: "ASSET",
    subType: "Other Current Asset",
    locked: true,
    description: "Income tax paid in instalments before the year-end assessment.",
  },

  // Cash
  {
    name: "Petty Cash",
    type: "ASSET",
    subType: "Cash",
    locked: true,
    description: "Small-denomination cash held for incidental day-to-day expenses.",
  },
  {
    name: "Undeposited Funds",
    type: "ASSET",
    subType: "Cash",
    locked: true,
    description: "Customer payments received but not yet deposited into a bank account.",
  },

  // Fixed Asset
  {
    name: "Furniture and Equipment",
    type: "ASSET",
    subType: "Fixed Asset",
    description: "Long-lived physical assets used in operations (desks, computers, machinery).",
  },

  // Stock
  {
    name: "Inventory Asset",
    type: "ASSET",
    subType: "Stock",
    locked: true,
    description: "Cost of inventory held for resale.",
  },

  // ──────────────── LIABILITY ────────────────

  // Other Current Liability
  {
    name: "Tax Payable",
    type: "LIABILITY",
    subType: "Other Current Liability",
    locked: true,
    description: "Output GST / VAT owed to the tax authority.",
  },
  {
    name: "Employee Reimbursements",
    type: "LIABILITY",
    subType: "Other Current Liability",
    locked: true,
    description: "Reimbursable expenses incurred by employees, owed back to them.",
  },
  {
    name: "Opening Balance Adjustments",
    type: "LIABILITY",
    subType: "Other Current Liability",
    locked: true,
    description: "Bridge account used while loading historical opening balances.",
  },
  {
    name: "Unearned Revenue",
    type: "LIABILITY",
    subType: "Other Current Liability",
    locked: true,
    description: "Customer payments received for goods or services not yet delivered.",
  },
  {
    name: "TDS Payable",
    type: "LIABILITY",
    subType: "Other Current Liability",
    locked: true,
    description: "TDS withheld from vendors, owed to the tax authority.",
  },

  // Non Current Liability
  {
    name: "Mortgages",
    type: "LIABILITY",
    subType: "Non Current Liability",
    description: "Long-term loans secured against property.",
  },
  {
    name: "Construction Loans",
    type: "LIABILITY",
    subType: "Non Current Liability",
    description: "Loans drawn down to fund construction projects.",
  },

  // Other Liability
  {
    name: "Dimension Adjustments",
    type: "LIABILITY",
    subType: "Other Liability",
    locked: true,
    description: "Suspense account for cross-dimension reclass entries.",
  },

  // ──────────────── EQUITY ────────────────
  {
    name: "Retained Earnings",
    type: "EQUITY",
    subType: "Equity",
    locked: true,
    description: "Cumulative net income retained in the business, net of distributions.",
  },
  {
    name: "Drawings",
    type: "EQUITY",
    subType: "Equity",
    locked: true,
    description: "Withdrawals taken by the proprietor for personal use.",
  },
  {
    name: "Investments",
    type: "EQUITY",
    subType: "Equity",
    description: "Capital contributed by owners or partners.",
  },
  {
    name: "Distributions",
    type: "EQUITY",
    subType: "Equity",
    description: "Pro-rata profit distributions to members / partners.",
  },
  {
    name: "Dividends Paid",
    type: "EQUITY",
    subType: "Equity",
    description: "Dividends declared and paid to shareholders.",
  },
  {
    name: "Owner's Equity",
    type: "EQUITY",
    subType: "Equity",
    locked: true,
    description: "Net worth of the sole proprietor in the business.",
  },
  {
    name: "Opening Balance Offset",
    type: "EQUITY",
    subType: "Equity",
    locked: true,
    description: "Balancing equity entry when opening balances are loaded.",
  },
  {
    name: "Capital Stock",
    type: "EQUITY",
    subType: "Equity",
    description: "Par value of issued share capital.",
  },

  // ──────────────── INCOME ────────────────
  {
    name: "Shipping Charge",
    type: "INCOME",
    subType: "Income",
    locked: true,
    description: "Shipping / freight income billed to customers.",
  },
  {
    name: "General Income",
    type: "INCOME",
    subType: "Income",
    locked: true,
    description: "Miscellaneous income that doesn't fit elsewhere.",
  },
  {
    name: "Interest Income",
    type: "INCOME",
    subType: "Income",
    locked: true,
    description: "Interest earned on deposits, loans, or investments.",
  },
  {
    name: "Other Charges",
    type: "INCOME",
    subType: "Income",
    locked: true,
    description: "Income from non-standard charges billed to customers.",
  },
  {
    name: "Late Fee Income",
    type: "INCOME",
    subType: "Income",
    locked: true,
    description: "Late-payment fees collected from overdue customer accounts.",
  },
  {
    name: "Discount",
    type: "INCOME",
    subType: "Income",
    locked: true,
    description: "Discounts received from vendors (treated as income).",
  },

  // ──────────────── EXPENSE ────────────────
  {
    name: "Lodging",
    type: "EXPENSE",
    subType: "Expense",
    locked: true,
    description: "Hotel and lodging costs for business travel.",
  },
  {
    name: "Travel Expense",
    type: "EXPENSE",
    subType: "Expense",
    description: "Transportation and related travel costs for business trips.",
  },
  {
    name: "Telephone Expense",
    type: "EXPENSE",
    subType: "Expense",
    description: "Telephone and mobile-network charges.",
  },
  {
    name: "Automobile Expense",
    type: "EXPENSE",
    subType: "Expense",
    description: "Fuel, maintenance, and other vehicle running costs.",
  },
  {
    name: "IT and Internet Expenses",
    type: "EXPENSE",
    subType: "Expense",
    description: "Internet, hosting, SaaS, and IT-services charges.",
  },
  {
    name: "Janitorial Expense",
    type: "EXPENSE",
    subType: "Expense",
    description: "Cleaning, sanitation, and facility-upkeep costs.",
  },
  {
    name: "Postage",
    type: "EXPENSE",
    subType: "Expense",
    description: "Postal and courier charges.",
  },
  {
    name: "Printing and Stationery",
    type: "EXPENSE",
    subType: "Expense",
    description: "Office printing supplies and stationery.",
  },
  {
    name: "Salaries and Employee Wages",
    type: "EXPENSE",
    subType: "Expense",
    description: "Gross salaries and wages paid to employees.",
  },
  {
    name: "Meals and Entertainment",
    type: "EXPENSE",
    subType: "Expense",
    description: "Client meals and entertainment expenses.",
  },
  {
    name: "Depreciation Expense",
    type: "EXPENSE",
    subType: "Expense",
    description: "Periodic depreciation charge on fixed assets.",
  },
  {
    name: "Consultant Expense",
    type: "EXPENSE",
    subType: "Expense",
    description: "Fees paid to independent consultants and advisors.",
  },
  {
    name: "Repairs and Maintenance",
    type: "EXPENSE",
    subType: "Expense",
    description: "Upkeep and repair costs for equipment and premises.",
  },
  {
    name: "Other Expenses",
    type: "EXPENSE",
    subType: "Expense",
    locked: true,
    description: "Catch-all expense for items that don't fit elsewhere.",
  },
  {
    name: "Purchase Discounts",
    type: "EXPENSE",
    subType: "Expense",
    locked: true,
    description: "Discounts received reducing the cost of purchases.",
  },
  {
    name: "Depreciation And Amortisation",
    type: "EXPENSE",
    subType: "Expense",
    description: "Combined depreciation and amortisation charge for the period.",
  },
  {
    name: "Transportation Expense",
    type: "EXPENSE",
    subType: "Expense",
    description: "Freight, shipping, and other transportation costs.",
  },
  {
    name: "Merchandise",
    type: "EXPENSE",
    subType: "Expense",
    description: "Cost of merchandise consumed in operations.",
  },
  {
    name: "Uncategorized",
    type: "EXPENSE",
    subType: "Expense",
    locked: true,
    description: "Default holding account for expenses pending re-classification.",
  },
  {
    name: "Raw Materials And Consumables",
    type: "EXPENSE",
    subType: "Expense",
    description: "Cost of raw materials and consumable supplies.",
  },
  {
    name: "Contract Assets",
    type: "EXPENSE",
    subType: "Expense",
    description: "Costs incurred to fulfil customer contracts.",
  },
  {
    name: "Rent Expense",
    type: "EXPENSE",
    subType: "Expense",
    description: "Rent for office premises and equipment.",
  },
  {
    name: "Office Supplies",
    type: "EXPENSE",
    subType: "Expense",
    description: "Day-to-day consumable office supplies.",
  },
  {
    name: "Advertising And Marketing",
    type: "EXPENSE",
    subType: "Expense",
    description: "Advertising, promotion, and marketing campaign costs.",
  },
  {
    name: "Bank Fees and Charges",
    type: "EXPENSE",
    subType: "Expense",
    locked: true,
    description: "Bank service fees, wire-transfer charges, and similar.",
  },
  {
    name: "Credit Card Charges",
    type: "EXPENSE",
    subType: "Expense",
    description: "Processing fees on customer credit-card payments.",
  },

  // ──────────────── COST OF GOODS SOLD ────────────────
  {
    name: "Cost of Goods Sold",
    type: "COST_OF_GOODS_SOLD",
    subType: "Cost Of Goods Sold",
    locked: true,
    description: "Direct cost of goods sold to customers during the period.",
  },
  {
    name: "Labor",
    type: "COST_OF_GOODS_SOLD",
    subType: "Cost Of Goods Sold",
    description: "Direct labour cost charged to the cost of goods sold.",
  },
  {
    name: "Materials",
    type: "COST_OF_GOODS_SOLD",
    subType: "Cost Of Goods Sold",
    description: "Direct materials consumed in producing goods sold.",
  },
  {
    name: "Subcontractor",
    type: "COST_OF_GOODS_SOLD",
    subType: "Cost Of Goods Sold",
    description: "Payments to subcontractors directly attributable to a job.",
  },
  {
    name: "Job Costing",
    type: "COST_OF_GOODS_SOLD",
    subType: "Cost Of Goods Sold",
    description: "Job-specific costs accumulated for project-level costing.",
  },
];
