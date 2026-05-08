# Sales module

## Sub-modules

| Sub-module | Status | Notes |
|---|---|---|
| Customers | **complete** | list / new / detail / edit, bulk import, GSTIN prefill, portal access toggle, statement export |
| Quotes | **complete** | list / new / detail / edit, status (Draft/Sent/Accepted/Declined/Expired/Invoiced), email, bulk PDF zip, convert to invoice or sales order |
| Sales Orders | **complete** | list / new / detail / edit, status (Draft/Confirmed/Closed/Void), convert to invoice |
| Invoices | **complete** | list / new / detail / edit, status pills (Draft/Sent/Overdue/Partially Paid/Paid/Void/Written-off), line items, custom fields, attachments, recurring source, Razorpay portal Pay Now, **stock decrement on tracked items** |
| Recurring Invoices | **complete** | list / new / detail / edit, frequency (daily / weekly / monthly / every-N / custom), pause/resume/stop, daily cron generates next occurrence |
| Delivery Challans | **complete** | list / new / detail, status (Draft/Open/Delivered/Invoiced/Returned), bulk PDF zip |
| Payments Received | **complete** | list / new / detail, allocate across invoices, excess-as-credit, **partial Razorpay refunds**, email receipt |
| Credit Notes | **complete** | list / new / detail, apply to one or many open invoices, refund unallocated balance |
| Debit Notes | **complete** | list / new / detail / edit, status (Open/Void/Closed), bulk PDF zip |

Retail Invoices (`/sales/retail-invoices`) is intentionally lighter weight — single-line POS-style entry — and shares the Invoice schema.

## Numbering
`NumberSeries` per module (default `INV-` for invoices, `QT-` for quotes, `SO-` for sales orders, etc.). Editable at `/settings/number-series`.

## Saved Views
Every list page reads its chevron-dropdown from the `SavedView` table.
- System views (e.g. "All", "Unpaid") are seeded lazily on first page load per (org × module).
- Users can create custom views via "+ New Custom View" — currently filters by status; date/customer/amount filter builders are a follow-up.
- User-created views show an inline X to delete (system views are protected).

## Inventory hooks
Invoices write `InventoryAdjustment` rows for line items pointing at items with `trackInventory: true`:
- **Create** → negative adjustment (`reason: "Invoice <number>"`)
- **Update** (DRAFT only) → reverses originals + re-applies fresh
- **Void / soft-delete** → mirrors with positive adjustments (`reason: "Reverse Invoice <number>"`)

Stock = `Item.openingStock + sum(InventoryAdjustment.quantity)`. Sales Orders, Delivery Challans, and Credit Notes do **not** mutate stock yet (separate stories).

## Razorpay
- Per-organization config in `PaymentGatewayConfig` (encrypted secret with AES-256-GCM via `lib/crypto.ts`).
- Portal Pay Now button on customer-facing invoice pages creates a Razorpay Order via REST API.
- Webhook at `/api/sales/razorpay/webhook` verifies HMAC-SHA256 signatures (timing-safe), handles `payment.captured` / `payment.failed` / `refund.processed`, idempotent on `razorpayPaymentId`.
- Merchant-initiated refunds via the in-app dialog, including partial refunds (proportional invoice rollback).

## Email
All outbound email goes through the `EmailJob` queue (status: PENDING / SENT / FAILED, max 5 retries). Daily cron at `/api/cron/email-job-retry` drains the queue.

## Custom fields
Per-organization, per-entity-type field definitions live in `CustomFieldDefinition`; values per row in `CustomFieldValue`. Render on PDFs and the customer portal when `showOnPdf` is set.

## Tests
- **Unit (Vitest):** `tests/unit/sales/` — covers `lib/sales/totals.ts` and `lib/sales/refund-math.ts`. Gated in CI.
- **E2E (Playwright):** `tests/e2e/sales-lifecycle.spec.ts` smoke-tests every list page renders without an error overlay; `tests/e2e/sales-receivables-loop.spec.ts` walks customer → quote → invoice → payment.
