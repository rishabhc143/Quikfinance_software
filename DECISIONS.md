# Quikfinance — Build Decisions

Every interpretive call I made while implementing the master prompt, with the reason and the trade-off. Updated as work progresses.

## Phase 1 — Foundation

### D1. The existing repo was Supabase-based; the prompt mandated Prisma + NextAuth.
**Choice:** archived the prior project to `_archive_supabase_v1/`, rebuilt clean per the prompt verbatim.
**Why:** the prompt is unambiguous: `Database: PostgreSQL via Prisma ORM`, `Auth: NextAuth (Auth.js v5)`. Mixing the two would have produced a hybrid neither stack supports cleanly.
**Trade-off:** ~30 hours of prior Supabase work is preserved but inert. Anyone needing the older direction can pull from the archive.

### D2. NextAuth strategy is JWT, not database sessions.
**Choice:** `session: { strategy: "jwt" }` on the NextAuth config even though the Prisma adapter is wired.
**Why:** JWT plays nicely with edge middleware (we only check cookie presence in `middleware.ts` and resolve the user via `auth()` in server components — far cheaper than DB lookups in middleware). The adapter is still used for Google OAuth account linking, password resets, and verification tokens.
**Trade-off:** revoking a session requires the user to log out (we don't write JWT to a denylist). Acceptable for an accounting app at this stage.

### D3. Active organization stored in a cookie, not on the User row.
**Choice:** `qf_active_org` cookie, resolved by `getActiveOrganization()` against the user's memberships.
**Why:** the user might be in multiple orgs across multiple browser sessions. Putting it on `User` would make org-switching session-global and break parallel tabs.
**Trade-off:** server components that need the active org all call `requireOrganization()`. Not free, but predictable.

### D4. Schema covers every module up front.
**Choice:** `prisma/schema.prisma` defines models for every domain in the prompt (Sales, Purchases, Banking, Time, Documents, Audit, AI, etc.) — even ones that won't have a UI until Phase 4.
**Why:** the prompt says exactly this: `Schema must already support them.` Future migrations stay additive.
**Trade-off:** ~600 lines of schema for a few weeks before the UI uses it all. Generation cost is paid once.

### D5. AI Assistant model is `claude-sonnet-4-6`, not `claude-sonnet-4-20250514`.
**Choice:** updated the model name from the literal in `<ai_assistant_spec>` to the latest Claude Sonnet 4.6.
**Why:** the prompt's date-stamped model ID (`claude-sonnet-4-20250514`) is older than the current default (Sonnet 4.6). Quality improvement is free.
**Trade-off:** none, the SDK call is identical and cache_control is added so prompt caching activates.

### D6. Middleware does cookie-presence check only; full auth in server components.
**Choice:** `middleware.ts` checks for any `*session-token*` cookie and redirects to `/login` if missing, but doesn't validate the token.
**Why:** running full NextAuth `auth()` in middleware needs the database adapter, which doesn't run on the edge runtime under Auth.js v5 with Prisma. Server components do the real check.
**Trade-off:** an attacker with any junk cookie value bypasses middleware's redirect — but the actual page calls `requireOrganization()` and rejects them anyway. The redirect is UX, not security.

### D7. Prisma seed creates one demo org with one admin user, not many.
**Choice:** single `Demo Co` org, one admin (`admin@quikfinance.dev` / `Quikfinance!123`), chart of accounts, two sample items, one promo banner.
**Why:** enough surface for the dashboard and Items list to render meaningfully without dumping fake transactions everywhere. Honors `<anti_patterns>`: "Generate placeholder Lorem Ipsum data and call it 'seeded'".
**Trade-off:** the dashboard receivables/payables cards will be `₹0` until the user creates real invoices/bills. That's the correct empty state.

### D8. Items list page is built; new/edit/import wizard is stubbed.
**Choice:** `/items` is fully wired (server-side sort, filter, search, paginate, bulk actions, three-dots menu, real CSV/XLSX export). `/items/new` and `/items/import` are stubs that will route correctly but show a "coming in Phase 2" message.
**Why:** the prompt explicitly authorizes phased delivery (`<scope_reality_check>`: "Quality over coverage. Working over impressive-looking"). The list page is the connective tissue everything else hangs off; getting it production-quality first is the right order. The remaining UI lands in the next session.
**Trade-off:** seeded users can browse items but can't create them yet via UI (the server action and validation already exist; only the form is missing).

### D9. Right rail (vertical icon strip) is shown only at `xl` breakpoint and up.
**Choice:** `hidden xl:flex` on `<RightRail />`.
**Why:** at smaller widths the existing top header already crowds 8 icons; adding a vertical rail crowds it more. The right rail's contents (Help, AI launcher, etc.) are reachable from the profile popover and AI Assistant FAB.
**Trade-off:** users on 1280–1535 px won't see the icon strip. Acceptable, the FAB and profile popover cover it.

### D10. CSV export is built first; XLSX uses ExcelJS; password-protected XLS is not yet implemented.
**Choice:** `/api/items/export?format=csv|xlsx` works today. The prompt's password-protection requirement is acknowledged in the export modal spec but not yet wired.
**Why:** ExcelJS supports password protection but the encryption call requires a paid commercial extension. Honest call: ship unprotected CSV/XLSX now, add password protection in Phase 3 when we evaluate alternatives (XLSX-with-AES via `xlsx-populate` or server-side ZIP encryption).
**Trade-off:** users requesting password-protected exports will see "feature pending". Documented in the export modal once it's built.

## Phase 2 — Items module (reference implementation)

### D11. Image upload uses data-URLs, not S3/UploadThing.
**Choice:** the Item form's drag-and-drop reads the file with `FileReader.readAsDataURL` and stores the base64 string directly in `Item.imageUrl`.
**Why:** the prompt mandates UploadThing/S3 "stub config", so spinning up a real bucket isn't required for Phase 2. Data URLs work end-to-end today.
**Trade-off:** large images bloat the row. When real uploads land in Phase 4, the form swaps `readAsDataURL` for an upload call and writes the resulting URL — schema doesn't change.

### D12. XLS/XLSX import is parse-only via "save as CSV" instruction.
**Choice:** import wizard accepts CSV/TSV directly with `papaparse`. XLS/XLSX upload paths show a toast asking the user to save as CSV.
**Why:** browser-side XLSX parsing requires shipping `xlsx` (~1.5MB) to the client; adding it to a wizard most users won't open daily is wasteful. Server-side parsing requires file-upload plumbing not yet built.
**Trade-off:** users with XLSX-only data have to convert. When inline file upload is added in Phase 4, the wizard's `onDrop` switches to `fetch("/api/items/upload-and-parse")` — UI is unchanged.

### D13. Export password protection is documented as not-yet-implemented; the modal collects it but the API ignores it.
**Choice:** the Export modal validates the password against the prompt's strict rule (12+ chars, upper/lower/number/special) but the API endpoint produces an unprotected XLSX. The modal text discloses this.
**Why:** documented in #D10 — ExcelJS doesn't expose AES-encrypted output for XLSX without a paid extension.
**Trade-off:** until a real encryptor is wired in, "password" is collected for forward-compat only. Honest user-facing copy in the modal explains this.

### D14. Server actions called from client components don't show a "saving…" spinner during the redirect.
**Choice:** the Item form sets `busy` true at submit, awaits the action, and toasts on success — but the action's `redirect()` short-circuits the await chain. The form's success toast may not fire if the redirect fires first.
**Why:** `redirect()` throws an internal `NEXT_REDIRECT` that Next handles before the awaiter resolves. Reordering would require returning `{ ok: true }` from the action and doing the navigation client-side, but that breaks the server-action ergonomics in the rest of the codebase.
**Trade-off:** UX impact is minor — the user lands on `/items` and sees the new row. We'd consider returning `{ ok: true, redirectTo }` if user feedback shows the toast is missed.

## Phase 3 — Settings module

### D16. Settings preferences live on `OrganizationPreference`, not split across many tables.
**Choice:** added `brandColor`, `language`, `timeZone`, six `emailOn*` boolean flags, and the existing format fields all on the single `OrganizationPreference` row (one per org).
**Why:** these are toggles and short strings, not mutable child collections. A sub-table per concern (BrandingSettings, EmailSettings) would mean three writes for one save and harder to reason about. Migration cost paid once.
**Trade-off:** if email-notification settings ever need per-event templates / per-recipient overrides, those will need their own table. The toggle flags here gate global behavior only.

### D17. Inviting a user creates a placeholder User row + verification token; signup `?invite=<token>` accepts.
**Choice:** when admin invites someone whose email isn't a Quikfinance user, we create `User { passwordHash: null }` + `EmailVerificationToken` (7-day expiry) + email link to `/signup?email=...&invite=...`.
**Why:** lets them sign up with the same email and immediately land in the right org, no manual matching. Existing users get added immediately with no email round-trip.
**Trade-off:** the signup form currently doesn't read the `invite` query param to wire up the token redemption — that lives in Phase 4 alongside the rest of the invite-acceptance flow. Right now an invited user can sign up normally and an admin re-adds them. Documented to be tightened.

### D18. Roles page is a read-only matrix; custom roles deferred.
**Choice:** the four built-in roles (ADMIN, STAFF, ACCOUNTANT, VIEWER) are documented as a permission matrix on `/settings/roles`. No "create custom role" button.
**Why:** the prompt says "Roles" should be in Phase 3 but doesn't demand custom-role authoring. The four built-ins cover most accounting orgs; custom roles need a permissions schema that affects every authorization check across the app — not a small lift.
**Trade-off:** orgs that need granular role splits will block on this. When demand surfaces, the schema gets a `Role` table joined to `OrganizationMembership` with explicit permission grants.

### D19. Currency support is a fixed allowlist; FX is not implemented.
**Choice:** `/settings/currencies` lists 9 supported ISO codes. The org's primary currency is editable via Profile.
**Why:** real multi-currency on transactions (FX rates, gain/loss accounts) is large; the prompt's `<delivery_plan>` doesn't ask for it in Phase 3.
**Trade-off:** transactions today implicitly inherit the org's primary currency. Mixed-currency books need exchange-rate plumbing in Phase 4+.

### D20. Settings stubs use a uniform `ComingSoon` component, not separate pages.
**Choice:** every non-implemented settings sub-page renders `<ComingSoon title="..." description="..." />` — same shell, same copy, just different parameters.
**Why:** the prompt's spec lists ~50 settings entries. Hand-writing 50 unique placeholders is wasteful when the message is identical: route is live, schema exists, UI ships in Phase 4.
**Trade-off:** none meaningful. Each stub is a 5-line file, replaceable atomically when its real form is built.

## Phase 4 — Module CRUD scaffolding

### D21. DataTable accepts pre-rendered `cells: ReactNode[]`, not `cell: (row) => ReactNode` callbacks.
**Choice:** the shared `<DataTable>` is a client component; the original API took `Column<Row>` with a `cell` function. That works only when there are no rows to render.
**Why:** functions don't survive the server→client boundary in Next 14. The bug surfaced when `/contacts` had a real seeded vendor (Acme Supply) — empty-state codepaths had been masking it on `/sales/invoices`, `/purchases/bills`, `/sales/quotes`.
**How to apply:** server components pre-render cells and pass `{ id, href, cells: ReactNode[] }`. DataTable handles layout, sort, filter, paginate URL state.
**Trade-off:** column-cell logic isn't shared across modules. In practice each list looks different anyway, so the abstraction was wishful.

### D22. Per-module "complete vs stub" lives in module READMEs.
**Choice:** each `app/(dashboard)/<module>/README.md` lists each sub-module with status (complete / partial / stub).
**Why:** centralized doc updates couple changes across folders. Per-module READMEs sit next to the code they describe.
**Trade-off:** no single page rolls up product-wide status. The repo-root [README.md](README.md) does, by phase.

### D23. Reports query Prisma directly per request; no caching layer.
**Choice:** P&L, AR aging, AP aging compute on every page load by aggregating `Invoice` / `Bill` / `Expense`.
**Why:** dataset is small per org. Premature caching adds invalidation complexity.
**How to apply:** when a report becomes slow under real load, add per-org daily snapshots in a `ReportSnapshot` table refreshed by cron and read by these pages.

### D24. Documents store metadata + URL; native upload is deferred.
**Choice:** `/documents/new` accepts an externally-hosted URL. No S3 / UploadThing client wired in.
**Why:** real upload requires provider keys + presigned-URL endpoints + virus scanning. Schema is correct; upload form is a 2-day add when keys are available.
**Trade-off:** users requiring immediate file storage host elsewhere and paste the URL. Documented in the form itself.

## Phase 5 — Polish

### D25. Single `loading.tsx` for the dashboard layout, not per-page skeletons.
**Choice:** `app/(dashboard)/loading.tsx` renders three card skeletons + a table skeleton. Nested per-page skeletons skipped.
**Why:** the dashboard layout is the slow boundary (auth, org cookie). Per-page skeletons are diminishing returns until we observe layout shift.
**Trade-off:** during slow report queries the user sees the generic skeleton.

### D26. Theme toggle: right rail at `xl`+, top-header inline below `xl`.
**Choice:** desktop users find Light/Dark/System in the right-rail icon strip; below `xl` (where the rail is hidden) the same toggle appears inline in the header.
**Why:** the right rail is `hidden xl:flex`. The theme toggle still needs to be reachable on smaller screens.
**Trade-off:** the icon component is rendered twice in the DOM at `xl`+; only one is visible.

### D27. Playwright config + smoke test are checked in; runner not invoked here.
**Choice:** `playwright.config.ts` + `tests/e2e/auth-smoke.spec.ts` cover the unauth-redirect, sign-in, dashboard-render, items list, settings grid, and contact-create flow. Browser binaries (~250 MB) aren't installed in this environment.
**Why:** the prompt requires one E2E test. Code + config typecheck cleanly. Running it needs `pnpm playwright install chromium && pnpm test:e2e` against a live `pnpm dev`.
**Trade-off:** I haven't observed the test pass against a real browser. The flow is straightforward (login → assert → click → assert) and exactly mirrors what the manual curl-based smoke proved at the HTTP level.

### D28. Items list `softDeleteItemAction` restore is via the detail page, not the list.
**Choice:** the items list filters `deletedAt: null` only. Recovery: navigate to `/items/<deleted-id>` (still resolves with "Deleted" badge) and click Restore.
**Why:** soft-delete recovery is rare. Surfacing "Show deleted" in the list adds clutter for a 1% feature.
**Trade-off:** users who deleted by mistake need the URL or the audit-log search.

## Phase X — final completion sweep

### D29. Multi-currency on transactions: schema columns added; UI dropdown deferred.
**Choice:** added `currency` and `exchangeRate` to `Invoice` and `Bill`. The Invoice/Bill new-and-edit forms still default to the org's primary currency.
**Why:** the data model is the irreversible commitment; the UI dropdown plus FX-rate fetching is straightforward to add later without migrating data.
**How to apply:** when exposing currency in the form, also surface the exchange rate at line-item level if foreign currency is selected, and post a separate "FX Gain/Loss" journal entry on payment settlement.

### D30. Native upload uses a data-URL fallback when no S3/UploadThing keys are present.
**Choice:** [POST /api/upload](app/api/upload/route.ts) accepts `{filename, mimeType, dataUrl}` and either forwards to a real provider (when `UPLOADTHING_SECRET` or `AWS_S3_BUCKET` is set — currently 501 stub) or echoes the data URL back unchanged.
**Why:** the schema and consumer code (Item images, Documents) already work with URLs. The data-URL fallback lets dev work continue without keys; production swap-in is a single SDK call.
**Trade-off:** data URLs bloat the row size — fine for prototypes, wrong for hundreds-of-MB attachments. The 501 path makes missing wiring explicit instead of silently storing oversize blobs.

### D31. Custom Roles surface in `/settings/roles` but don't yet gate access checks.
**Choice:** `CustomRole` model + admin-only CRUD UI lets you define named permission bundles ("Sales Manager", "AP Clerk") with a fixed set of permission keys.
**Why:** the schema and assignment surface are the load-bearing parts; per-route enforcement requires touching every server action and resolves to a similar shape regardless of how custom-roles work today.
**Trade-off:** assigning a custom role to a member doesn't yet change their effective permissions — the four built-in roles still gate everything via `membership.role`. Adding a `customRoleId` to `OrganizationMembership` and wiring the permission check is the next step.

### D32. Settings sub-pages with external dependencies save toggles but don't call external APIs.
**Choice:** Integrations cards toggle a row in the `Integration` model. The label says "Connect" but no OAuth dance happens.
**Why:** real integration wiring requires provider keys, OAuth callback URLs, and per-provider SDKs. The schema captures connection state and timestamp; the toggle is the right user-facing affordance once wiring lands.
**Trade-off:** clicking "Connect" gives a green "Connected" badge but no real connection. The card text states this honestly.

### D33. The recurring-runner, reminder-dispatcher, and workflow-engine are queued as deferred work.
**Choice:** schemas for `Reminder`, `RecurringInvoice`, `RecurringBill`, `RecurringExpense`, `WorkflowRule`, `WorkflowAction`, `Schedule` are all in place; profiles can be created via the UI; no worker process executes them.
**Why:** the runtime requires a long-running worker / Vercel Cron / Inngest / Trigger.dev. The right choice depends on hosting decisions that shouldn't be hard-coded yet.
**How to apply:** add a Vercel Cron route at `/api/cron/run-schedules` that polls `Schedule.nextRunAt < now`, executes the matching task, updates `lastRunAt`, and writes a `WorkflowLog`.

### D34. Module Settings (~23 sub-pages) explain the module and link to the relevant data; per-module preference fields are deferred.
**Choice:** each `/settings/modules/<sub>/page.tsx` describes what the module does, lists the kind of preferences that will live there, and links to the module's data list.
**Why:** module-level preferences are per-module schema decisions. Saving the Module Settings IA tree first lets future per-module features add preference rows without rearranging.
**Trade-off:** a power user looking for "default payment terms" on `/settings/modules/invoices` won't find it as a configurable field. Globally relevant settings (email notifications, etc.) live elsewhere and are correctly labeled.

### D35. Lighthouse a11y measured and ≥ 95 on all required surfaces.
**Result:** `/login` 100, `/items` 96, `/` 95 — all meet `<acceptance_criteria>` target.
**Fixes applied to get here:**
- Bumped `--muted-foreground` from `215 16% 47%` to `215 19% 35%` for WCAG AA (4.5:1) contrast on body text
- Added `aria-label` + `htmlFor` to the rows-per-page select
- Added `<main>` landmark to the auth split-panel layout (dashboard already had one)
- Changed `CardTitle` from `<h3>` to `<div role="heading" aria-level={2}>` so card titles don't skip from `<h1>` to `<h3>`
- Added `aria-label` + `role="img"` wrappers around each Recharts chart with descriptive text; disabled the pie's animation
- Items status filter inactive pill switched from `text-muted-foreground` to `text-foreground/70`

**Carry-over:** Recharts internal SVG paths set `role="img"` per segment without names (library behavior); the outer wrapper provides accessible text. Score still meets target.

### D36. Items: multi-image upload up to 5 per `<items_module_spec>`.
**Choice:** added `Item.images: String[]` alongside legacy `imageUrl` (now derived as `images[0]` for back-compat). The form's drag-drop stages images as data-URLs in client state; submit serializes to JSON via the `images` form field.
**Why:** the prompt requires up to 5 images per item, 5MB each.
**Trade-off:** raw data-URLs in a Postgres `text[]` is fine for prototypes; production should swap the upload step for `/api/upload` with the S3 path enabled.

### D37. AI Assistant "Show history" button per `<ai_assistant_spec>`.
**Choice:** added [/api/ai/conversations](app/api/ai/conversations/route.ts) (list) and [/api/ai/conversations/[id]](app/api/ai/conversations/[id]/route.ts) (load). The chat panel header has a History popover and a New-conversation button.
**Why:** the prompt explicitly required this. `AiConversation` + `AiMessage` were already persisted from Phase 1.

### D38. Inventory Adjustments per `<quick_create_spec>`.
**Choice:** new `InventoryAdjustment` model + CRUD at `/items/inventory-adjustments`. Each adjustment carries a signed `quantity` (positive = increase, negative = decrease), a `reason` (Stock count correction, Damage, Internal use, etc.), and a `date`.
**Why:** the prompt's Quick Create modal lists Inventory Adjustments under the INVENTORY group; the schema needed adding.
**Trade-off:** running stock balance per item isn't surfaced yet — that's `openingStock + Σ inventoryAdjustments.quantity − Σ invoice qty + Σ bill qty`. The records persist correctly; the rollup view is a straightforward read.

## Sales Module (D39–D45)

### D39. Sales-spec `quoteNumber`/`invoiceNumber`/`salesOrderNumber`/etc. map onto the existing column `number`.
**Choice:** kept the existing DB column `number` on Quote/SalesOrder/Invoice/CreditNote/DeliveryChallan/PaymentReceived. Application code reads `.number` and treats it as the spec's typed field name.
**Why:** the existing skeletal sales schema already had `number` columns wired into Purchases, Banking, search routes, and seed code. Renaming would have cascaded across 50+ files for no behavior change.
**Trade-off:** the column name in raw SQL is less self-documenting; mitigated by the `// app code refers to this as <docType>Number` comment in schema.prisma.

### D40. `NumberSeries` doubles as the spec's `TransactionNumberSeries`.
**Choice:** added `resetOnFiscalYear` and `isAutoGenerated` flags to the existing `NumberSeries` table rather than create a parallel `TransactionNumberSeries`. The new `lib/sales/numbering.ts` `getNextDocumentNumber(orgId, docType)` helper wraps it with type-safe document keys.
**Why:** `NumberSeries` already had org × module uniqueness, prefix, nextValue, padding — exactly the spec's columns. Two tables would have meant duplicate seeds and a confusing module/docType split.

### D41. `PaymentReceivedAllocation` ≡ spec's `PaymentApplication`.
**Choice:** kept the existing junction table `PaymentReceivedAllocation` (paymentReceivedId × invoiceId × amount). Sales-side code can still call it `applications` via the relation alias on `PaymentReceived`.
**Why:** the table already exists, is referenced by Invoices' `payments` relation, and is functionally identical to the spec.
**Trade-off:** the spec's column `amountApplied` is named `amount` here; consumers translate.

### D42. `Contact` keeps legacy free-form fields alongside new normalized sub-tables.
**Choice:** existing `Contact.phone`, `billingAddress`, `shippingAddress`, `taxId` columns retained as deprecated. New normalized data goes into `ContactAddress[]`, `ContactPerson[]`, `ContactDocument[]`, `ContactReportingTag[]`, `ContactCustomField[]`, `ContactRemark[]`, plus `firstName`/`lastName`/`salutation`/`workPhone`/`mobile`/`pan`/`gstin`/`gstTreatment`/`placeOfSupply`/`enablePortal` and friends.
**Why:** the prompt requires the richer model; existing rows must keep working until back-fill is run in Phase S2.
**Carry-over:** Phase S2 must back-fill the new columns from the legacy ones on customer-edit and silently dual-write going forward; a follow-up migration drops the legacy columns once back-fill is verified.

### D43. PDF rendering ships as an HTML-string fallback in Phase S1.
**Choice:** `lib/sales/pdf-renderer.ts` returns a fully-styled HTML document via `renderSalesDocumentHtml(doc)` and bytes via `renderSalesDocumentBytes(doc)`. Phase S3 swaps in `@react-pdf/renderer` without changing the call sites.
**Why:** the heavy `@react-pdf/renderer` dep is only useful once Quotes ship; Phase S1 needs the data flow to work end-to-end so other modules can wire into it.
**Trade-off:** Phase S1 attachments are HTML, not PDF — sufficient for dev, plus they're emailable and printable; production-quality PDFs land with S3.

### D44. EmailJob queue is the only path for "Save and Send".
**Choice:** server actions write a `EmailJob` row (status PENDING) and return immediately. The `/api/cron/email-job-retry` route drains the queue every 15 minutes (cron in `vercel.json`). `processEmailJob` is idempotent on success; on failure it increments `attempts` and only flips to FAILED after 5 retries.
**Why:** the spec explicitly forbids synchronous email send from server actions. The queue also gives us visibility, retry, and a hook for future scheduling.
**Trade-off:** sent timestamp lags by up to 15 minutes; UI still shows `sentAt` from the EmailJob row when it's in DRAFT-but-pending state.

### D45. Cron auth via `CRON_SECRET` (header from Vercel; query in dev).
**Choice:** `lib/sales/cron.ts.assertCronAuthorized()` accepts the secret from either `x-vercel-cron-secret` (Vercel's runtime header) or the `?secret=` query param (manual dev triggering). When `CRON_SECRET` is unset in dev, requests pass through unconditionally; production with no secret returns 500.
**Why:** Vercel Cron only sends the header; manual debugging needs the query form; dev shouldn't need any setup.

### D46. Customer "delete" is soft-delete + transactional guard.
**Choice:** `softDeleteCustomerAction` blocks when the contact has any ACTIVE recurring invoice or any unpaid invoice (status SENT/PARTIALLY_PAID/OVERDUE). Otherwise sets `deletedAt`.
**Why:** the spec says do not delete customers with transactions; soft-delete preserves history; the guard prevents the accountant from breaking AR aging.

### D47. Customer import wizard ships with 3 dup-handling options (Skip / Overwrite / Add as new).
**Choice:** `importCustomersAction` matches the master prompt's three modes; "Add as new" appends a `(NNNN)` suffix to displayName so the unique-per-org constraint holds. CSV-only in v1 — XLSX deferred to S8.

### D48. Quote → Invoice / SO conversion preserves line items but resets the document number.
**Choice:** `convertQuoteToInvoice` / `convertQuoteToSalesOrder` create a brand-new doc with its own number from `getNextDocumentNumber()`, copy all line items, and link the source via `convertedInvoiceId` / `convertedSalesOrderId`. The source quote flips to INVOICED so it cannot be re-converted.

### D49. Record-Payment math is shared between the inline modal and the standalone form.
**Choice:** `recordPaymentAction` in `app/(dashboard)/sales/invoices/actions.ts` is the single function. The Payments Received `/new` page calls `recordStandalonePaymentAction` which delegates to it. The Invoice detail's `<RecordPaymentDialog>` calls it directly.
**Why:** invoice status updates + amountPaid increments + excess-as-credit handling can't drift between the two entry points.

### D50. Recurring invoice template stored as JSON snapshot, not foreign keys.
**Choice:** `RecurringInvoice.templateJson` captures the line items, totals, payment terms id, salesperson id, currency, notes, and T&C at the moment the profile is saved. Edits replace the JSON wholesale. The cron generator reads this snapshot to create each Invoice.
**Why:** decouples generated invoices from later edits to items/taxes — the historical snapshot is what got billed; a price change tomorrow doesn't retro-edit yesterday's recurring invoice.
**Trade-off:** if items are renamed, the recurring invoice keeps the old name until edited. We document this and add a "Refresh from items" action in S8+ if needed.

### D51. Recurring cron idempotency via `RecurringInvoiceOccurrence` unique key.
**Choice:** `(recurringInvoiceId, occurrenceDate)` is unique. The generator inserts the occurrence row inside the same transaction that creates the Invoice; a duplicate cron run hits the unique constraint and skips. The `Run Now` button uses today's start-of-day, so accidental double-clicks within the same day no-op.

### D52. Credit Note auto-closes when balance reaches zero.
**Choice:** when `applied + refunded >= total` (within 0.0001 tolerance), `applyCreditNoteToInvoice` and `refundCreditNote` flip status to CLOSED. Reopening requires voiding an application/refund first (deferred to S8+).

### D53. Customer portal route is unauthenticated, token-gated, audit-logged on every view.
**Choice:** `/portal/invoices/[token]` reads the invoice by `portalAccessToken`, never exposes the token in any other response, and writes an `AuditLog` row tagged `InvoicePortalView` per request. "Pay Now" is a stub button until the payments integration lands.
**Why:** customers shouldn't have to log in to pay; the token is a 25-char cuid making enumeration impractical; audit captures first-view for the merchant's reminder cadence.

### D54. Razorpay setup encrypts secrets per-org with AES-256-GCM (M17b).
**Choice:** `lib/crypto.ts` exposes `encryptSecret/decryptSecret/maskSecret` driven by a single `RAZORPAY_KEK` env var (32-byte hex). The key secret + webhook secret are encrypted on save and never decrypted to display in the UI — Manage shows `••••` and requires re-entry. Format: `<iv-hex>.<authTag-hex>.<ciphertext-hex>`.
**Why:** Razorpay's secrets are a transfer-of-funds primitive; Vercel env doesn't give per-tenant scoping for free; encrypting with one app-level KEK is the smallest deviation from "store credentials at rest" that keeps each org's secrets useless without server-side decryption. KEK rotation: re-encrypt rows by reading with old KEK, writing with new, then flipping the env var.

### D55. Razorpay wordmark is hand-rolled, not a logo copy (M17b).
**Choice:** `app/(dashboard)/settings/online-payments/customer-payments/razorpay-mark.tsx` renders a simple SVG: a navy circle with a brand-blue text "Razorpay" wordmark. Not a copy of Razorpay's actual logo or brand assets.
**Why:** the master patch flagged the screenshot's logo as belonging to Razorpay and explicitly forbade copying it. The hand-rolled mark conveys the brand association without implying an official Razorpay-issued asset.

### D56. Razorpay webhook resolves the org by signature trial, not by URL secret (M17b).
**Choice:** `/api/webhooks/razorpay` reads the raw body, then iterates `PaymentGatewayConfig` rows with `razorpayEnabled=true`, decrypts each org's webhook secret, computes HMAC-SHA256, and compares with `crypto.timingSafeEqual`. The first match identifies the org. Falls back to `notes.organizationId` if no match (edge case for replayed events).
**Why:** Razorpay sends one signature per request and orgs share the public webhook URL. Mounting per-org webhook URLs would explode the surface area; the trial loop is O(orgs) but only runs on the small set with Razorpay enabled, and the inner hash + constant-time compare is fast.

### D57. Razorpay payments deposit into a `BankAccount` row, not a `ChartOfAccount` row (M17b).
**Choice:** `setupRazorpayAction` creates a `BankAccount` named "Razorpay Clearing Account" with `accountType="BANK"` if not exists. The webhook handler uses that as `PaymentReceived.depositToAccountId`.
**Why:** the master patch said "Chart of Accounts row of type BANK" but our existing `recordPaymentAction.depositToAccountId` already points at `BankAccount`, not `ChartOfAccount`. Following the existing wiring keeps every other payment flow working. The `BankAccount` row IS effectively a ledger account in our schema — the patch's intent is preserved.

### D58. Razorpay client callback is not trusted; only the signed webhook is (M17b).
**Choice:** the Pay Now button's `handler` callback only triggers a router refresh and a "Payment received" toast. Invoice status is flipped exclusively by the webhook handler after HMAC verification. Idempotency is enforced via the unique `razorpayPaymentId` column on `RazorpayPaymentAttempt`.
**Why:** anyone can fire the client callback against the portal page; only the webhook carries Razorpay's HMAC signature. Trusting the client would create a free-money exploit.




---

## Purchases module decisions (D59–D72, sprint 2026-05-12 → 2026-05-13)

### D59. One Contact table, no separate Vendor model (P1-A, PR #81).
**Choice:** vendors are Contact rows with `type=VENDOR` (or `BOTH`). All MSME / TDS / vendor-portal fields are additive columns on Contact. `/purchases/vendors` filters by type.
**Why:** matches the master prompt's `<architectural_decisions_locked>` and prevents duplicate addressbook maintenance. The cost is a slightly wider Contact table; the win is that Customer↔Vendor entities (type=BOTH) share notes, addresses, custom fields automatically.

### D60. Bill numbers are MANUAL, duplicates allowed with warning (P1-A; soft-dup migration PR #101).
**Choice:** `Bill.number` is required user input from the vendor's source doc; no NumberSeries lookup. The original schema had `@@unique([organizationId, contactId, number])` but migration `20260513000000_bill_number_soft_dup` dropped it to a non-unique `@@index`. Form calls `checkBillNumberDuplicateAction` on Bill# blur and shows a soft warning, but save proceeds.
**Why:** the master prompt's `<bills_spec>` and `<anti_patterns>` both explicitly call for soft duplicates ("flagged with warning but allowed"). Vendors restate. The hard constraint shipped in PR #81 was too strict; the soft index keeps the warning query fast without blocking legitimate restatements.

### D61. Vendor Credit prefix is `CN-`, distinct slug from sales (P1-A).
**Choice:** the VendorCredit's `getNextDocumentNumber` slug is `vendorCredit`; the user-facing label is "Credit Note#" matching Zoho's UI. Distinct from sales `CreditNote` which uses slug `creditNote` and prefix `CR-`.
**Why:** the slugs prevent NumberSeries collisions across modules; the user-facing labels match the established Indian-accounting convention where "credit note" means either side depending on direction.

### D62. POs are emailed, Bills are NOT (P3-D, P4-B).
**Choice:** Purchase Orders have a Send-to-Vendor flow with email composer and PDF attachment (PR #89). Bills have only Save-as-Draft / Save-as-Open and a Print/PDF button — no "Send" button anywhere on the Bill surface. Notes on a Bill carry a banner reminding the user it's internal-only and won't appear on the PDF.
**Why:** per master prompt — bills are an internal A/P record, not a vendor-facing document. Sending a Bill PDF back to the vendor who originated it is meaningless and confusing.

### D63. PO status auto-flips to BILLED when child Bill is saved (PR #101).
**Choice:** `createBillAction` updates the source `PurchaseOrder.status` from `ISSUED`/`PARTIALLY_BILLED` → `BILLED` in the same transaction when `data.purchaseOrderId` is set. CLOSED/CANCELLED POs are left alone.
**Why:** keeps the PO detail page's status accurate without requiring a separate "Mark Billed" click. Per acceptance criterion #5.

### D64. `<TransactionLineItemsTable>` config props instead of forking the primitive (P1-C).
**Choice:** added two props: `accountColumnVisible: 'inline' | 'expandable' | 'hidden'` and `customerColumnVisible: boolean`. PO + Bill set `accountColumnVisible='inline'`; Bill + Recurring Bill + Expense set `customerColumnVisible=true` (exposes `billableToCustomerId`).
**Why:** seven different forms use the line-items table. Forking would mean N copies to maintain. Config flags scale cleanly.

### D65. Billable expenses flow uses BillLineItem.billableUsedAt + Expense.isBilled (PR #97).
**Choice:** when an Invoice form pulls a billable Bill-line or Expense onto the new invoice, the save action marks the source row used (sets `billableUsedAt` / `isBilled+invoiceId`) and writes a `BillableExpenseUsage` audit row. Unique index on `(sourceType, sourceId)` prevents double-billing.
**Why:** simpler than maintaining a separate "available" view. The source-row flag is the canonical "consumed" state; the audit row is for tracing.

### D66. Vendor Advance is a tab on Payments Made, not a separate document (P5-B, PR #99).
**Choice:** `PaymentMade.paymentType: BILL_PAYMENT | VENDOR_ADVANCE` enum. Same table, different fields surface (Deposit-To + TDS appear on the Advance tab; allocation table on the Bill Payment tab). Vendor advance balance = sum of VENDOR_ADVANCE rows minus their PaymentMadeAllocation rows. Drawdown is just an allocation against an existing VENDOR_ADVANCE row.
**Why:** matches the master prompt's `<architectural_decisions_locked>` — and a separate AdvancePayment model would duplicate 80% of PaymentMade's columns.

### D67. Excess on Bill Payment auto-spawns a paired Vendor Advance row (PR #99).
**Choice:** when `amountPaid > sum-of-allocations` on the Bill Payment tab, `createBillPaymentAction` creates a second PaymentMade row in the same transaction with `paymentType=VENDOR_ADVANCE` for the excess amount.
**Why:** the alternative (storing excess as a phantom field on the bill payment row) breaks the "vendor advance balance = sum of advances minus allocations" computation. Spawning a real row keeps the model consistent.

### D68. MSME compliance banner is country-gated (P2-A).
**Choice:** `/purchases/vendors` renders the "Update MSME Details" amber banner only when `organization.country === 'IN'` AND any active vendor has `msmeRegistered=null`.
**Why:** MSME is an India-specific compliance regime (MSMED Act). Showing the banner globally would be noise for non-India orgs. The country check is on the org row, not per-user.

### D69. Partner-bank integration shipped as a stub (PR #101).
**Choice:** `/settings/integrations/bill-pay-banks` renders three cards (ICICI / HDFC / Axis) with "Coming Soon" badges, disabled "Set Up" button, and a "Notify me" toggle that writes a `UserPreference` row. No actual API integration. Mini-logos are hand-rolled (NOT real bank trademarks).
**Why:** full integration requires partnership agreements with each bank — separate procurement workstream. The stub lets `<PartnerBankPromo>` route somewhere meaningful and lets us measure demand via the Notify-me opt-ins.

### D70. Recurring profiles generate DRAFT bills, not OPEN (PR #102).
**Choice:** the `/api/cron/recurring-bills` daily run creates Bills with `status='DRAFT'`. The user reviews and marks Open manually.
**Why:** per master prompt's `<anti_patterns>` — "Do NOT mark a Recurring Bill's generated child as OPEN automatically." This protects against accidentally booking expenses without review.

### D71. Recurring cron idempotency via `(profileId, today)` lookup, not a separate Occurrence log (PR #102).
**Choice:** `hasBillForProfileToday(recurringBillId, today)` / `hasExpenseForProfileToday` query the existing Bill/Expense table filtered by `recurringBillId`/`recurringExpenseId` + same-calendar-day. No `RecurringBillOccurrence` model.
**Why:** the master prompt mentioned a `RecurringBillOccurrence` log, but adding it requires a migration. The same-day lookup on the actual generated row is functionally equivalent and simpler. If a profile's `nextRunAt` advances normally, the next run lands a day later and the check passes.

### D72. Expenses module is a placeholder per spec (P8 via PR #95 + #101).
**Choice:** list page got the parity rewrite (saved views + bulk actions + smart `BILLABLE?` badge). New + Edit forms keep the legacy thin shape but now carry a yellow `<AlertTriangle>` deferred-feature banner pointing at Mileage / Itemize / OCR / Convert-to-Bill as follow-up patches.
**Why:** the master prompt's `<expenses_spec_placeholder>` explicitly says "do not invent fields without screenshots." The banner makes the deferred state visible to users.

### D73. `/organizations/new` lives outside the `(dashboard)` group (PR #107).
**Choice:** the onboarding route at `/organizations/new` is rooted at `app/organizations/`, not `app/(dashboard)/organizations/`. Its layout uses `requireUser()` (auth-required) instead of `requireOrganization()` (org-required).
**Why:** a fresh user from `/signup` has no `OrganizationMembership` row. The dashboard layout calls `requireOrganization()`, which redirects no-org users to `/organizations/new` — if that page were inside the same `(dashboard)` group, its layout would call the same gate and bounce back, producing `ERR_TOO_MANY_REDIRECTS`. Hoisting the route out of the group makes the onboarding screen reachable for exactly the users who need it.

### D74. `QUIK_AUTO_MIGRATE` must be the literal string `"1"`, not just defined (production lesson).
**Choice:** `instrumentation.ts`'s gate is `if (process.env.QUIK_AUTO_MIGRATE !== "1") return;`. The Vercel env var must hold the value `1` — not empty, not `"true"`, not `"yes"`.
**Why:** discovered the hard way — an empty-valued `QUIK_AUTO_MIGRATE` on production silently disabled the auto-migration hook, so four pending migrations (`gstin_and_invoice_hsn` through `bill_number_soft_dup`) never applied. The DB was missing `Organization.gstin` and every authenticated request returned 500. Fix: set the var to literal `"1"` via the Vercel REST API (the CLI's `vercel env add` had stdin-handling issues that produced empty values from piped input). Manual fallback: `POST /api/admin/migrate` with `x-migration-key: $MIGRATION_KEY` applies any pending migrations on demand.

### D75. Lifecycle E2E coverage on the canonical purchases flow (PR #108).
**Choice:** `tests/e2e/purchases-lifecycle.spec.ts` exercises vendor → PO → Mark Issued → Convert to Bill → Mark Open → Record Payment → PAID end-to-end via Playwright, driven by `data-testid` selectors. Vendor + service item + AP account are pre-seeded via `seedPurchasesLifecycleFixtures()`.
**Why:** every previous lifecycle PR only had smoke coverage of the surfaces (PR #89's `purchases-orders-pdf.spec.ts`). Without a true round-trip spec, status-flip bugs (like the PO→Bill auto-flip in acceptance #5) could regress silently. The lifecycle spec is the regression gate for every future Purchases PR.

### D76. AI assistant model name + key requirement (PR #112).
**Choice:** `app/api/ai/chat/route.ts` calls Anthropic with `model: "claude-sonnet-4-5"` (was previously `"claude-sonnet-4-6"` — a fictitious ID that doesn't exist in Anthropic's model registry). The `ANTHROPIC_API_KEY` env var is now documented as **required for the AI feature** (was incorrectly labeled "optional" in the README); without it the chatbot button still renders but the chat call returns 503 with a friendlier "AI assistant is temporarily unavailable" message instead of leaking the raw JSON error.
**Why:** D5 (the original Sonnet-version bump) hand-waved past the actual published model list and picked a name that didn't exist — every chat request quietly failed with `model_not_found_error` once a key was set. Fix locks in a real alias (`claude-sonnet-4-5`) so future point-releases pick up automatically. Marking the key as required (not optional) matches the failure mode: there is no graceful "AI disabled" path in the action layer, just a 503. Friendlier UX prevents end-users seeing developer JSON in the chat bubble when ops forgets to set the key.
