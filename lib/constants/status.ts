import type { StatusVariant } from "@/components/ui/status-pill";

/**
 * Single source of truth for document lifecycle status enums + their
 * StatusPill variant mappings. Surfaces in the audit follow-up batch 1
 * (CRIT-3) — these strings were previously hardcoded in 13+ list pages.
 *
 * Why:
 *  - Renaming a status (e.g. "OPEN" → "OPEN_BILL") used to mean grepping
 *    15 files and hoping you didn't miss any.
 *  - TypeScript couldn't catch typos. `"DARFT"` would silently match
 *    nothing in a `STATUS_VARIANT[s]` lookup.
 *  - The recent StatusPill sweep (PRs #305 + #311) standardized rendering
 *    but kept the enum strings duplicated across files.
 *
 * Usage pattern (in list pages):
 *
 *   import { INVOICE_STATUS_VARIANT as STATUS_VARIANT } from "@/lib/constants/status";
 *   // ...later:
 *   <StatusPill variant={STATUS_VARIANT[invoice.status] ?? "neutral"}>
 *     {invoice.status}
 *   </StatusPill>
 *
 * The `as STATUS_VARIANT` alias keeps the rest of the file unchanged.
 *
 * Conventions for the variant mapping:
 *  - DRAFT / INACTIVE / terminal-low-emphasis → `neutral`
 *  - In flight, info-only → `info` (OPEN, ISSUED, SENT, VENDOR_ADVANCE)
 *  - Needs follow-up → `warning` (PARTIALLY_*, PAUSED, RETURNED)
 *  - Terminal good → `success` (PAID, BILLED, CLOSED, DELIVERED, INVOICED, ACTIVE, PUBLISHED)
 *  - Terminal bad → `danger` (CANCELLED, VOID, EXPIRED, DECLINED)
 */

// ─── Sales ────────────────────────────────────────────────────────────

export const INVOICE_STATUS = {
  DRAFT: "DRAFT",
  SENT: "SENT",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
  VOID: "VOID",
  WRITTEN_OFF: "WRITTEN_OFF",
} as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

export const INVOICE_STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: "neutral",
  SENT: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "danger",
  VOID: "neutral",
  WRITTEN_OFF: "neutral",
};

export const QUOTE_STATUS = {
  DRAFT: "DRAFT",
  SENT: "SENT",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
  EXPIRED: "EXPIRED",
  INVOICED: "INVOICED",
} as const;
export type QuoteStatus = (typeof QUOTE_STATUS)[keyof typeof QUOTE_STATUS];

export const QUOTE_STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: "neutral",
  SENT: "info",
  ACCEPTED: "success",
  DECLINED: "danger",
  EXPIRED: "danger",
  INVOICED: "success",
};

export const SALES_ORDER_STATUS = {
  DRAFT: "DRAFT",
  CONFIRMED: "CONFIRMED",
  CLOSED: "CLOSED",
  VOID: "VOID",
} as const;
export type SalesOrderStatus = (typeof SALES_ORDER_STATUS)[keyof typeof SALES_ORDER_STATUS];

export const SALES_ORDER_STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: "neutral",
  CONFIRMED: "info",
  CLOSED: "success",
  VOID: "danger",
};

export const CREDIT_NOTE_STATUS = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
  VOID: "VOID",
} as const;
export type CreditNoteStatus = (typeof CREDIT_NOTE_STATUS)[keyof typeof CREDIT_NOTE_STATUS];

export const CREDIT_NOTE_STATUS_VARIANT: Record<string, StatusVariant> = {
  OPEN: "info",
  CLOSED: "success",
  VOID: "danger",
};

export const DEBIT_NOTE_STATUS = {
  DRAFT: "DRAFT",
  OPEN: "OPEN",
  VOID: "VOID",
} as const;
export type DebitNoteStatus = (typeof DEBIT_NOTE_STATUS)[keyof typeof DEBIT_NOTE_STATUS];

export const DEBIT_NOTE_STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: "neutral",
  OPEN: "info",
  VOID: "danger",
};

export const DELIVERY_CHALLAN_STATUS = {
  DRAFT: "DRAFT",
  OPEN: "OPEN",
  DELIVERED: "DELIVERED",
  INVOICED: "INVOICED",
  RETURNED: "RETURNED",
} as const;
export type DeliveryChallanStatus =
  (typeof DELIVERY_CHALLAN_STATUS)[keyof typeof DELIVERY_CHALLAN_STATUS];

export const DELIVERY_CHALLAN_STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: "neutral",
  OPEN: "info",
  DELIVERED: "success",
  INVOICED: "success",
  RETURNED: "warning",
};

// ─── Purchases ────────────────────────────────────────────────────────

export const BILL_STATUS = {
  DRAFT: "DRAFT",
  OPEN: "OPEN",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
  VOID: "VOID",
  WRITTEN_OFF: "WRITTEN_OFF",
} as const;
export type BillStatus = (typeof BILL_STATUS)[keyof typeof BILL_STATUS];

export const BILL_STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: "neutral",
  OPEN: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "danger",
  VOID: "danger",
  WRITTEN_OFF: "neutral",
};

export const PURCHASE_ORDER_STATUS = {
  DRAFT: "DRAFT",
  ISSUED: "ISSUED",
  PARTIALLY_BILLED: "PARTIALLY_BILLED",
  BILLED: "BILLED",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
} as const;
export type PurchaseOrderStatus =
  (typeof PURCHASE_ORDER_STATUS)[keyof typeof PURCHASE_ORDER_STATUS];

export const PURCHASE_ORDER_STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: "neutral",
  ISSUED: "info",
  PARTIALLY_BILLED: "warning",
  BILLED: "success",
  CLOSED: "success",
  CANCELLED: "danger",
};

export const VENDOR_CREDIT_STATUS = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
  VOID: "VOID",
} as const;
export type VendorCreditStatus =
  (typeof VENDOR_CREDIT_STATUS)[keyof typeof VENDOR_CREDIT_STATUS];

export const VENDOR_CREDIT_STATUS_VARIANT: Record<string, StatusVariant> = {
  OPEN: "info",
  CLOSED: "success",
  VOID: "danger",
};

// ─── Recurring profiles (Invoice / Bill / Expense / Manual Journal) ──

export const RECURRING_STATUS = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  EXPIRED: "EXPIRED",
  STOPPED: "STOPPED",
} as const;
export type RecurringStatus = (typeof RECURRING_STATUS)[keyof typeof RECURRING_STATUS];

export const RECURRING_STATUS_VARIANT: Record<string, StatusVariant> = {
  ACTIVE: "success",
  PAUSED: "warning",
  EXPIRED: "neutral",
  STOPPED: "neutral",
};

// ─── Accountant ───────────────────────────────────────────────────────

export const MANUAL_JOURNAL_STATUS = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
} as const;
export type ManualJournalStatus =
  (typeof MANUAL_JOURNAL_STATUS)[keyof typeof MANUAL_JOURNAL_STATUS];

export const MANUAL_JOURNAL_STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
};
