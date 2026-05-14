# Purchases module

Companion to `app/(dashboard)/sales/README.md` — same shape, vendor side.

The Purchases master prompt (`Quikfinance_Purchases_Master_Prompt.docx`) defines 8 sub-modules. This README tracks what's shipped, what's pending, and the architectural decisions taken along the way.

---

## Status (May 2026, post-PR #108)

| Sub-module | Routes | State |
|---|---|---|
| **Vendors** | `/purchases/vendors` + `/new` + `/[id]` + `/[id]/edit` + `/import` | ✅ Complete |
| **Purchase Orders** | `/purchases/orders` + `/new` + `/[id]` + `/[id]/edit` + `/[id]/pdf` + `/[id]/send` | ✅ Complete |
| **Bills** | `/purchases/bills` + `/new` + `/[id]` + `/[id]/edit` + `/[id]/pdf` + `/import` | ✅ Complete — full lifecycle, fromPO seeding, soft dup-warning override, PDF route, **Apply Credits dialog**, **Convert to Recurring**, CSV import |
| **Payments Made** | `/purchases/payments-made` + `/new` + `/[id]` | ✅ Complete — two-tab form (Bill Payment + Vendor Advance), allocation table, drawdown, excess-to-advance |
| **Vendor Credits** | `/purchases/vendor-credits` + `/new` + `/[id]` + `/[id]/edit` + `/[id]/pdf` + `/import` | ✅ Complete — multi-line form, Apply-to-Bill + Record Refund dialogs, PDF route, CSV import |
| **Recurring Bills** | `/purchases/recurring-bills` + `/new` + `/[id]` + `/[id]/edit` + `/import` | ✅ Complete — **full multi-line form**, **detail page** with Pause/Resume/Stop/Run-Now/Edit, daily `/api/cron/recurring-bills` generating DRAFT Bills, CSV import |
| **Recurring Expenses** | `/purchases/recurring-expenses` + `/new` + `/[id]` + `/[id]/edit` + `/import` | ✅ Complete — **full form**, **detail page** with transitions, daily `/api/cron/recurring-expenses` generating Expense rows (billable ones surface on next Invoice), CSV import |
| **Expenses** | `/purchases/expenses` + `/new` + `/[id]/edit` | 🟡 List parity-complete; form has deferred-feature banner per spec — Mileage / OCR / Convert-to-Bill in refinement patch (explicit `<expenses_spec_placeholder>` in master prompt) |
| **Billable expenses → Invoice** | `<BillableExpensesPanel>` on `/sales/invoices/new` | ✅ Complete — pulls unbilled Bill lines + Expenses for a customer, marks them used on save |
| **Partner-bank integration** | `/settings/integrations/bill-pay-banks` | ✅ Stub page with 3 banks (ICICI / HDFC / Axis) + Notify-me opt-in. Live API integration deferred per spec |
| **Bill statuses cron** | `/api/cron/bill-statuses` | ✅ Flips OPEN bills past dueDate → OVERDUE daily |
| **Lifecycle Playwright spec** | `tests/e2e/purchases-lifecycle.spec.ts` | ✅ Full end-to-end coverage: vendor → PO → Mark Issued → Convert to Bill → Mark Open → Record Payment → PAID |

---

## Architectural decisions (locked)

These come from the master prompt's `<architectural_decisions_locked>` block and shape every PR. Don't revisit unless you have a strong reason — they were chosen to keep the Sales/Purchases code path symmetrical:

1. **One Contact table** — vendors are `Contact` rows with `type=VENDOR` (or `BOTH`). No separate Vendor model. The Vendors page filters by type.
2. **Vendor-specific fields are additive on Contact**: `msmeRegistered`, `msmeNumber`, `msmeCategory`, `msmeRegisteredDate`, `defaultTdsId`, `enableVendorPortal`, `vendorPortalToken`. Customer-side ignores these.
3. **Bill numbers are MANUAL** — no `NumberSeries` row for `BILL`. Free-text input with uniqueness validation per `(orgId, vendorId)`. Duplicates flagged with a warning but allowed.
4. **Other Purchases docs auto-generate numbers** via `getNextDocumentNumber()`: PO (`PO-`), Payment Made (`PM-`), Vendor Credit (`CN-` per Zoho's UI), Recurring Bill (`RB-`), Recurring Expense (`RE-`), Expense (`EX-`).
5. **`TransactionLineItemsTable` gets two config props** (added in PR #82):
    - `accountColumnVisible: 'inline' | 'expandable' | 'hidden'` (default `'expandable'`; PO + Bill use `'inline'`)
    - `customerColumnVisible: boolean` (default `false`; Bill + Recurring Bill + Expense use `true` — exposes `lineItem.billableToCustomerId`)
6. **Vendor Advance is a tab on the Payments Made form**, not a separate document. `PaymentMade.paymentType: BILL_PAYMENT | VENDOR_ADVANCE`. Same table, different allocation targets.
7. **Billable expenses flow**: when a Bill or Expense line item has `billableToCustomerId` set, it becomes available to add to the next Invoice for that customer via `<BillableExpensesPanel>` (wired on `/sales/invoices/new`). Linked back via `BillableExpenseUsage`.
8. **Bills are NEVER emailed** — no "Save and Send" button. Save as Draft / Save as Open / Cancel.
9. **Purchase Orders ARE emailed to vendors** — Save as Draft / Save and Send / Cancel, mirroring the Invoice send flow.
10. **Partner-bank integration** is scaffolded as a `BankIntegration` model + `/settings/integrations/bill-pay-banks` page with "Coming soon" empty state. No actual API integration in v1.
11. **Vendor Portal** is scaffolded in schema (`Contact.enableVendorPortal`, `Bill.portalAccessToken`, `PurchaseOrder.portalAccessToken`) but no portal pages are built in v1.
12. **MSME compliance banner** appears on `/purchases/vendors` only when `org.country === 'IN'` AND any active vendor has `msmeRegistered=null`.
13. **"At Transaction Level" GST dropdown** on Bill / Recurring Bill / Vendor Credit / PO forms — stored as `placeOfSupply`. Single select for v1; full GST stacking behind a `gst.advanced` flag.
14. **Vendor Credits document-number prefix uses `CN-`** per Zoho's UI (label reads "Credit Note#"), distinct from sales `CreditNote` (which uses `CR-`).
15. **Expenses sub-module is a placeholder** — schema fully defined; list page + minimal CRUD scaffold; New Expense form is a stub with deferred-feature banner. Don't invent fields without screenshots.

---

## File map

### Vendors (PRs #83, #84, #85)

- `vendors/page.tsx` — list + MSME banner + bulk actions
- `vendors/new/page.tsx` — wraps `<VendorForm>`
- `vendors/[id]/page.tsx` — detail with tabs (Bills / POs / Credits / Payments / Overview)
- `vendors/[id]/edit/page.tsx` — pre-populated edit form
- `vendors/vendor-form.tsx` — 7-tab form using react-hook-form
- `vendors/actions.ts` — create/update/delete + bulk (active/inactive/delete)
- `vendors/import/page.tsx` + `wizard.tsx` + `actions.ts` — 4-step bulk-import flow
- `vendors/export-dialog.tsx` — 3-radio mode picker (vendors / contact persons / addresses)
- `lib/validations/vendor.ts` — zod schema (PAN regex, IFSC regex, MSME conditional, re-enter cross-field)
- `tests/unit/purchases/vendor-schema.test.ts` — 22 cases

### Purchase Orders (PRs #86, #87, #88, #89)

- `orders/page.tsx` — list with saved views + bulk Close/Cancel/Delete
- `orders/new/page.tsx` — pre-fetches dropdown options (vendors / customers / items / taxes / accounts / payment terms)
- `orders/[id]/page.tsx` — detail page with status-based action bar
- `orders/[id]/edit/page.tsx` — pre-populated edit form
- `orders/[id]/pdf/route.ts` — GET → `application/pdf`
- `orders/[id]/send/page.tsx` + `composer.tsx` — email composer (vendor-email pre-fill, subject/body templates)
- `orders/po-form.tsx` — full multi-line form (vendor band, delivery-address radio, AtTransactionLevelDropdown, totals card, attach files)
- `orders/actions.ts` — full CRUD + transitions (markIssued, cancel, close, clone, convertToBill, send) + bulk variants
- `lib/validations/purchase-order.ts` — zod schema with PO line item shape
- `tests/unit/purchases/po-totals.test.ts` — 13 totals math cases
- `tests/unit/purchases/po-transitions.test.ts` — 19 state-machine cases
- `tests/e2e/purchases-orders-pdf.spec.ts` — Playwright smoke

### Shared primitives extended for Purchases (PR #82)

- `components/shared/transaction-line-items-table.tsx` — `accountColumnVisible` + `customerColumnVisible`
- `components/shared/partner-bank-promo.tsx` — dismissible amber card; localStorage-keyed
- `components/shared/at-transaction-level-dropdown.tsx` — collapsible Place-of-Supply picker (all 36 Indian state codes)
- `components/shared/billable-expenses-banner.tsx` — stub for the Invoice form
- `components/shared/action-form-button.tsx` (PR #88) — client wrapper for server-action transition buttons
- `lib/sales/numbering.ts` — extended with 6 Purchases document types
- `lib/sales/saved-views.ts` — adds 8 module slugs with system-view seeds
- `lib/sales/pdf-renderer.ts` + `lib/sales/pdf-document.tsx` (PR #89) — extended to recognize `type='PURCHASE_ORDER'`

### Foundation (PR #81)

- `prisma/schema.prisma` — Contact extensions, ContactBankAccount, expanded Bill/PurchaseOrder/PaymentMade/VendorCredit/Expense, BillableExpenseUsage, BankIntegration
- `prisma/migrations/20260512000000_add_purchases_module/migration.sql` — additive migration

---

## Acceptance scorecard (post-PR #108)

**18 of 19 acceptance criteria fully met (95%).** The remaining 1
is partial — `Manage Custom Fields` link is wired on every list
page, but the spec-fidelity column-customization niceties
(Reset Column Width, Customize Columns) require `TransactionListPage`
/ `DataTable` primitive changes and are tracked as polish, not
Purchases-specific work.

Headline fixtures of completeness, in priority order:
- All eight Purchases sub-modules (Vendors / POs / Bills /
  Payments / Vendor Credits / Recurring Bills / Recurring Expenses
  / Expenses) ship with list + new + detail + edit routes.
- Three daily crons (`/api/cron/recurring-bills`,
  `/api/cron/recurring-expenses`, `/api/cron/bill-statuses`) wired
  in `vercel.json`, each gated by `CRON_SECRET` via
  `assertCronAuthorized()`.
- CSV import wizards on Vendors / Bills / Vendor Credits /
  Recurring Bills / Recurring Expenses (PR #85, #106).
- Full PO → Bill → Payment → PAID Playwright spec (PR #108).
- Apply Credits + Convert to Recurring + fromPO + fromBillId
  cross-flow links (PR #105, #106).

## What's pending (deliberate / out-of-module)

After PRs #91–#108, what remains is genuinely deferred per spec
or scoped outside the Purchases module:

### Three-dots column-customization niceties (primitive-level)

Spec calls for **Reset Column Width** + **Customize Columns**
dropdowns on every list page's three-dots menu. These require
per-user column-state persistence (new `UserListPreference` model
or localStorage) plus `DataTable` primitive changes — they affect
*every* list page in the app (Sales included), so they're tracked
as a shared-primitive polish PR, not Purchases work.

### Expenses module flesh-out

The master prompt's `<expenses_spec_placeholder>` explicitly defers
Mileage / OCR / Itemize / Convert-to-Bill to a refinement patch.
The current placeholder banner on `/purchases/expenses/new` calls
this out to the user.

### Vendor Portal UI

Schema fields exist (`Contact.enableVendorPortal`,
`Bill.portalAccessToken`, `PurchaseOrder.portalAccessToken`) but
the portal pages are deliberately not built in v1 per spec.

### Partner-bank live API

Stubbed at `/settings/integrations/bill-pay-banks` with 3 banks
and a Notify-me opt-in. Full API integration is a separate
procurement workstream, not part of the accounting product.

### Multi-line CSV import

`PR #106`'s import wizards accept one primary line per CSV row.
Multi-line bulk import would need a parent-ref/child-ref schema
design — tracked as a future enhancement, not blocking spec.

---

## Verification gates (per PR)

Every PR in P2/P3 shipped through the same gates:

1. `pnpm prisma generate && pnpm build` (CI)
2. `pnpm lint` (CI)
3. `pnpm test --run` — currently **187 Vitest tests**, 54 of them under `tests/unit/purchases/`
4. `pnpm exec playwright test` — currently **6 specs**, 1 of them covering Purchases
5. Vercel preview build green
6. **No admin merge** — if CI fails, fix it.

---

## Numbers and totals

The pure-function totals primitive lives in `lib/sales/totals.ts`:

```ts
import { computeDocument } from "@/lib/sales/totals";

const totals = computeDocument({
  lines: [{ quantity, rate, discount, discountType, taxRate }],
  documentDiscount: { value, type },
  documentTax: { rate, type: "TDS" | "TCS" },  // TDS subtracts, TCS adds
  adjustment: signedNumber,
});
```

`computeDocument` returns strings with 4 decimal places matching the `Decimal(18,4)` DB column shape. Used identically by both Sales and Purchases — `tests/unit/purchases/po-totals.test.ts` and `tests/unit/sales/totals.test.ts` cover the math.

---

## How to extend

Adding a new Purchases sub-module follows the same pattern:

1. **Schema** — make sure the model exists; PR #81 added all 8 sub-modules' tables.
2. **Numbering** — extend `SalesDocumentType` in `lib/sales/numbering.ts` and the `DEFAULT_PREFIX` / `SLUG` maps. Already done for Purchases.
3. **Saved views** — add the module slug to `SavedViewModule` in `lib/sales/saved-views.ts` and the `SYSTEM_VIEWS` seed entry. Already done for all 8 Purchases modules.
4. **Validation** — write a zod schema in `lib/validations/<module>.ts` exporting `xSchema` + `XInput` types.
5. **Actions** — server-actions file with `"use server"` directive; reuse `computeDocument`, `getNextDocumentNumber`, `writeAuditLog`, `revalidatePath`. Bulk actions should take `{ ids }` only (no extra params) so they can cross the RSC boundary directly to `BulkAwareDataTable`.
6. **List page** — render `<TransactionListPage>` + `<BulkAwareDataTable>`.
7. **New / Edit pages** — pre-fetch dropdown options server-side; render a client form component.
8. **Detail page** — header + status badge + status-driven action bar + line items table + linked-docs strip.
9. **Tests** — Vitest for totals/transitions/validation; Playwright smoke for at least the list + form render.

---

## Common gotchas (learned the hard way in P3-D)

- **Server actions and the RSC boundary**: don't wrap server actions in inline `async (input) => …` arrows when passing to client components. Next refuses to serialize the wrapper. Pass the server action directly; if you need to bind extra args, write a thin wrapper server action with `"use server"` in the same file.
- **`form action={…}` requires `(formData) => Promise<void>`**: server actions that take ids via `.bind(null, id)` don't typecheck against this shape. Use the `<ActionFormButton>` wrapper instead, or change the action's return type to `void`.
- **PDF route's renderable shape is generic**: `RenderableSalesDocument` is reused for POs. The `customer` field is populated with the vendor row when `type='PURCHASE_ORDER'`; the header label flips to "Vendor" instead of "Bill to".
