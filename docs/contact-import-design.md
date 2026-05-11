# Contact import from Google / Microsoft — design doc

## Status

**Not implemented.** The Google and Microsoft icons on the Customers
empty state are currently disabled (greyed out with a "coming soon"
tooltip). CSV import via `/sales/customers/import` works today and
is the only path forward until this is built.

This doc captures the design so the implementation is a typing
exercise once OAuth apps are registered.

## Why a doc, not a PR

The work needs **prerequisites that only the project owner can
supply**:

1. **Google Cloud OAuth app** — Console → APIs & Services → Credentials → Create OAuth client ID
   - Authorized redirect URI: `https://quikfinance-software.vercel.app/api/oauth/google/callback`
   - Scope: `https://www.googleapis.com/auth/contacts.readonly`
   - Verification flow if you intend to release publicly (Google
     scope review for "Restricted" scopes)
2. **Azure AD app registration** — portal.azure.com → App registrations → New registration
   - Redirect URI: `https://quikfinance-software.vercel.app/api/oauth/microsoft/callback`
   - API permission: `Contacts.Read` (delegated, not application)
3. **Env vars (encrypted, not sensitive)** added to Vercel:
   - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
   - `AUTH_MICROSOFT_ID`, `AUTH_MICROSOFT_SECRET`
   - `AUTH_GOOGLE_REDIRECT_URI`, `AUTH_MICROSOFT_REDIRECT_URI` (optional override)

Without these, building the routes is pure ceremony. Once they're in
place the whole feature is ~2 days for Google + ~1 day for Microsoft.

## Data model

One new table, one new column.

```prisma
model ContactImportSource {
  id             String              @id @default(cuid())
  organizationId String
  userId         String              // OAuth tokens are user-scoped
  provider       ContactImportProvider
  accessToken    String              // encrypted via lib/crypto (AES-256-GCM)
  refreshToken   String?             // encrypted
  tokenExpiresAt DateTime?
  scopes         String[]
  externalAccountId String?          // Google account ID or Microsoft objectId
  externalEmail  String?             // surface this in UI
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt
  organization   Organization        @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User                @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, provider]) // one connection per provider per user
  @@index([organizationId, provider])
}

enum ContactImportProvider {
  GOOGLE
  MICROSOFT
}
```

Plus the dedupe column on Contact (already partially used):

```prisma
model Contact {
  // …existing fields
  externalSourceProvider ContactImportProvider?
  externalSourceId       String? // resourceName from Google / id from Graph

  @@index([organizationId, externalSourceProvider, externalSourceId])
}
```

## Flow

### 1. Connect

User clicks the Google icon in the Customers empty state.

```
GET /api/oauth/google/start
  → generates state token, stores in cookie
  → redirects to https://accounts.google.com/o/oauth2/v2/auth?...
```

User consents on Google.

```
GET /api/oauth/google/callback?code=…&state=…
  → verifies state cookie
  → POST https://oauth2.googleapis.com/token  (exchange code → tokens)
  → encrypts and upserts ContactImportSource
  → redirects to /sales/customers/import-from-google
```

Same shape for Microsoft via `/api/oauth/microsoft/start`, with the
Graph token endpoint and a Microsoft-flavoured state check.

### 2. Preview

`/sales/customers/import-from-google` server component:
1. Resolves the user's `ContactImportSource`
2. Refreshes access token if expired (`grant_type=refresh_token`)
3. Calls `GET https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,addresses,organizations`
4. Paginates with `pageToken` until done
5. Maps each Google Person to a draft Contact:
   - `displayName` ← `names[0].displayName`
   - `firstName` / `lastName` ← `names[0].givenName/familyName`
   - `email` ← `emailAddresses[0].value` (preferring `metadata.primary`)
   - `workPhone` ← `phoneNumbers` where `type=work`
   - `mobile` ← `phoneNumbers` where `type=mobile`
   - `companyName` ← `organizations[0].name`
   - `externalSourceProvider = GOOGLE`, `externalSourceId = resourceName`
6. Dedupes against existing Contacts by **email exact match** OR
   `(provider, externalSourceId)` exact match
7. Renders a preview table: drafts grouped into **New** / **Update**
   / **Skip (duplicate)** sections with row-level checkboxes

### 3. Commit

User clicks Import N contacts. Server action:
1. For each selected row, `db.contact.upsert({ where: ..., create: ..., update: ... })`
2. Wraps in `db.$transaction` for atomicity (or batches of 100 with
   `createMany({ skipDuplicates: true })` for performance on big
   address books)
3. Writes one `AuditLog` row with `{ count, provider, sourceEmail }`
4. Redirects to `/sales/customers?import=success&count=N`

Same shape for Microsoft via Graph (`GET https://graph.microsoft.com/v1.0/me/contacts`).

### 4. Disconnect

`/settings/integrations` page (separate work) shows connected sources,
allows revocation. Revoking deletes the `ContactImportSource` row and
calls the provider's revoke endpoint
(`https://oauth2.googleapis.com/revoke?token=...`).

## Implementation order

1. Schema + migration — adds `ContactImportSource`, the new Contact
   columns, and the enum
2. `lib/oauth/google.ts` — `buildAuthorizeUrl`, `exchangeCode`,
   `refreshToken` (use `lib/crypto.ts` for token encryption)
3. `/api/oauth/google/start` + `/callback` routes
4. `lib/contact-import/google.ts` — paginated People API fetch +
   mapper
5. `app/(dashboard)/sales/customers/import-from-google/page.tsx` —
   preview UI (server component)
6. `import-from-google/actions.ts` — commit server action
7. Re-enable the Google icon in `sales-empty-state.tsx` (single-line
   change)
8. Repeat 2–7 for Microsoft

Unit tests at every step are cheap (Google's People API response
schema is documented; mapper is a pure function).

## Out of scope (for the eventual implementation PR)

- Two-way sync (writing Quikfinance changes back to Google/MS)
- Live sync via webhooks
- Bulk dedupe across the whole address book retroactively
- HubSpot / Salesforce / Pipedrive providers

## What's stubbed in the codebase right now

- `components/shared/sales-empty-state.tsx` — the three icons render
  as disabled `<span>` with a tooltip:
  > "Cloud import coming soon — use Import File above for CSVs today"
- The `importUsingHref` prop is still threaded through (used as a
  show/hide toggle for the whole "Import using" row); when this work
  ships, the prop becomes the import-flow base URL again and the
  icons get re-wired.
- README's "Sub-modules" table for Customers stays accurate — CSV
  import works.

## When you're ready to implement

Open an issue titled `[#10] Google contact import` and reference this
doc. The implementation PR should be split into two:

1. **OAuth foundation** — schema migration + token helpers + connect/
   callback routes + unit tests. Mergeable on its own; no user-visible
   change until step 2.
2. **Import UI** — preview page + commit action + re-enable the
   Google icon. Smaller PR that depends on step 1.

Microsoft is the same two-PR shape, after Google is in.
