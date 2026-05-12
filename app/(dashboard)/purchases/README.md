# Purchases module

Companion to `app/(dashboard)/sales/README.md` — same shape, vendor side.

The Purchases master prompt (`Quikfinance_Purchases_Master_Prompt.docx`) defines 8 sub-modules. This README tracks what's shipped, what's pending, and the architectural decisions taken along the way.

---

## Status (May 2026, post-PR #102)

| Sub-module | Routes | State |
|---|---|---|
| **Vendors** | `/purchases/vendors` + `/new` + `/[id]` + `/[id]/edit` + `/import` | ✅ Complete |
| **Purchase Orders** | `/purchases/orders` + `/new` + `/[id]` + `/[id]/edit` + `/[id]/pdf` + `/[id]/send` | ✅ Complete |
| **Bills** | `/purchases/bills` + `/new` + `/[id]` + `/[id]/edit` + `/[id]/pdf` | ✅ Complete — full lifecycle, fromPO seeding, soft dup-warning override, **PDF route** |
| **Payments Made** | `/purchases/payments-made` + `/new` + `/[id]` | ✅ Complete — **two-tab form** (Bill Payment + Vendor Advance), allocation table, drawdown, excess-to-advance |
| **Vendor Credits** | `/purchases/vendor-credits` + `/new` + `/[id]` + `/[id]/edit` + `/[id]/pdf` | ✅ Complete — multi-line form, **Apply-to-Bill** + **Record Refund** dialogs, **PDF route** |
| **Recurring Bills** | `/purchases/recurring-bills` + `/new` | 🟢 List + bulk Pause/Resume/Delete + **`/api/cron/recurring-bills`** generating DRAFT Bills daily. Full multi-line form + detail page is P7-B |
| **Recurring Expenses** | `/purchases/recurring-expenses` + `/new` | 🟢 List + bulk actions + **`/api/cron/recurring-expenses`** generating Expense rows daily (billable ones surface on next Invoice) |
| **Expenses** | `/purchases/expenses` + `/new` + `/[id]/edit` | 🟢 List parity-complete; form has deferred-feature banner per spec — Mileage / OCR / Convert-to-Bill in refinement patch |
| **Billable expenses → Invoice** | `<BillableExpensesPanel>` on `/sales/invoices/new` | ✅ Complete — pulls unbilled Bill lines + Expenses for a customer, marks them used on save |
| **Partner-bank integration** | `/settings/integrations/bill-pay-banks` | ✅ Stub page with 3 banks + Notify-me opt-in. Full API integration deferred |
| **Bill statuses cron** | `/api/cron/bill-statuses` | ✅ Flips OPEN bills past dueDate → OVERDUE daily |

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
7. **Billable expenses flow**: when a Bill or Expense line item has `billableToCustomerId` set, it becomes available to add to the next Invoice for that customer via `<BillableExpensesBanner>`. Linked back via `BillableExpenseUsage`.
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

## What's pending

After PRs #91–#102 most acceptance criteria are met. Remaining work:

### P7-B — Recurring profile full forms + detail pages (~1 PR)

The current Recurring Bill / Recurring Expense forms are thin (profileName / frequency / nextRunAt / amount). Per `<recurring_bills_spec>` / `<recurring_expenses_spec>` they should mirror the Bill / Expense form shape:
- Multi-line item table with `customerColumnVisible=true` so billable lines surface on generated rows
- "Never expires" toggle / end-date picker
- Detail page actions: **Pause / Resume / Stop / Edit / Delete / Run Now**
- "Run Now" calls into the cron's helper to generate immediately

### Spec-fidelity polish (~2 small PRs)

- Bill detail page: **Apply Credits** action (inverse of the credit-side dialog, picking from available credits)
- Bill form footer: **Make Recurring** link → `/purchases/recurring-bills/new?fromBillId=<id>`
- Bill detail page: **Convert to Recurring** action in the More menu
- Three-dots menu spec items not yet wired (Manage Custom Fields, Import submenus, Reset Column Width)

### Bill / Vendor Credit / Recurring import wizards (~1 PR)

The Vendor import wizard from PR #85 is the template. Same 4-step flow for Bills (with the "Link Bills to corresponding POs" checkbox per spec) + Vendor Credits + the two Recurring profile types.

### Full Playwright lifecycle (~1 PR)

End-to-end test that creates a vendor → PO → converts to Bill → records payment → applies a credit → reverses everything. Currently only the smoke test (PR #89) is in place.

**Total remaining: ~5 PRs.** Down from ~20 at sprint start and ~9 mid-sprint.

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
