# Sales module

## Sub-modules

| Sub-module | Status | Routes |
|------------|--------|--------|
| Invoices | **complete** | list / new / detail / edit, status pills (Draft/Sent/Overdue/Paid/Void), line items, drafts hard-delete, sent invoices soft-delete to VOID |
| Quotes | **complete** | list / new with single total |
| Sales Orders | stub | `/sales/orders` |
| Credit Notes | stub | `/sales/credit-notes` |
| Recurring Invoices | stub | `/sales/recurring-invoices` |
| Retail Invoices | stub | `/sales/retail-invoices` |
| Delivery Challans | stub | `/sales/delivery-challans` |
| Payments Received | stub | `/sales/payments-received` |

Schema for every stubbed sub-module is in place; only the UI is pending.

## Numbering
`NumberSeries` per module (default `INV-` for invoices, `QT-` for quotes). Editable at `/settings/number-series`.
