# Contacts module

**Status: complete**

CRUD over `Contact` model (`Customer`, `Vendor`, `Both`).

## Routes
- `/contacts` — list with debounced search, sortable name/type, pagination
- `/contacts/new` — create form (zod-validated)
- `/contacts/[id]` — detail page with activity counts (invoices/bills/quotes/sales orders)
- `/contacts/[id]/edit` — edit form
- soft-delete via the detail-page Delete button → sets `deletedAt`

## Audit
Every mutation writes to `AuditLog` via `writeAuditLog()`.
