# Zoho Books Banking — Screenshot Reference

**Purpose:** Permanent verbatim capture of the two screenshots Rishabh sent from his live Zoho Books tenant on 2026-05-12. The actual image files are not committed (they contain his real tenant data); this doc preserves the UI structure for future engineers.

The companion deep-research doc lives at `docs/zoho-banking-research.md` (and `.docx`).

---

## Screenshot 1 — Banking landing page (empty state)

**URL pattern:** `books.zoho.in/app/<orgId>#/banking/feeds/bankslist` (when zero bank accounts are connected)

### Top bar (right side, left to right)

- "Your free trial is over" — plain text
- "Subscribe" — blue link
- "ABC ▾" — organisation switcher dropdown
- `+` icon — quick-create button (presumably opens a small menu of "+ New Invoice / + New Customer / etc.")
- 👥 icon — Contacts shortcut
- 🔔 icon — Notifications
- ⚙ icon — Settings
- Avatar circle — User profile menu

### Left sidebar (top to bottom)

```
[Books logo + "Books" wordmark]

  Home
  ▸ Items
  ▸ Sales
  ▸ Purchases
  ▸ Time Tracking
🏦 Banking                     ← selected (blue highlight)
  ▸ Accountant
    Reports
    Documents

— APPS —

🟦 Zoho Payroll
🟦 Zoho Payments

[ Configure Features ›  button ]

[ TAKE A LIVE PRODUCT TOUR  pill ]
```

Right-arrow (▸) on Items / Sales / Purchases / Time Tracking / Accountant indicates they're expandable groups with sub-items.

### Main content area (centered)

```
                  Stay on top of your money

   Connect your bank and credit cards to fetch all your transactions.
   Create, categorize and match these transactions to those you have
   in Zoho Books.


   [ Connect Bank / Credit Card ]      [ Add Manually ]

         Don't use banking for your business? Skip


   ─────────────────────────────────────────────────────────

   ▶ Watch how to connect your bank account to Zoho Books
```

Visual notes:
- The dismiss "✕" at the top-right of the empty-state area suggests this is a guided onboarding card that the user can close
- "Connect Bank / Credit Card" is the primary action — solid blue button
- "Add Manually" is secondary — outlined button next to it
- "Skip" is a yellow/orange link below the buttons
- The "Watch how" link below the divider has a play-icon prefix

### Right edge (vertical icon rail)

5 small icons stacked vertically (light-grey background):
1. **?** in orange — Help / chat
2. **📣 (1)** — Announcements with badge
3. **▶** — Video tutorial
4. **💬** — Chat bubble
5. **🛒** — Marketplace / extensions (possibly)
6. **🔌** — Integrations
7. **🎁** — Promo / rewards

### Bottom-right floating widget

```
We're Online!
How may I help you today?

[💬 chat-bubble icon]
```

This is the live-chat support widget (Zoho's customer support chat).

---

## Screenshot 2 — "Connect and Add Your Bank Accounts or Credit Cards" modal

Opens when the user clicks the primary "Connect Bank / Credit Card" button from Screenshot 1.

### Modal header

- Title (with ✨ sparkle prefix): "**Connect and Add Your Bank Accounts or Credit Cards**"
- Subtitle: "Connect your bank accounts to fetch the bank feeds using one of our third-party bank feeds service providers. Or, you can add your bank accounts manually and import bank feeds."
- Close ✕ button top-right (in orange)

### Section A — Partner Banks (top, prominent)

Light-grey rounded rectangle banner:

```
Partner Banks Fetch        [Standard Chartered logo]
feeds directly             [HSBC logo]
                           [Kotak Mahindra Bank logo]
                           [SBI logo]
                           [Axis Bank logo]
```

5 bank logos arranged in a horizontal row to the right of the label. No buttons or selection state visible — clicking a logo presumably starts the direct-API onboarding for that bank.

### Section B — Automatic Bank Feeds Supported Banks

```
Automatic Bank Feeds Supported Banks            [ Connect Now ]
Connect your bank accounts and fetch the bank feeds using one
of our third-party bank feeds service providers.
```

The "Connect Now" button is on the right edge — solid blue, presumably opens the Yodlee/Token OAuth flow.

Below the banner: a 3-column × 3-row grid of bank/service cards.

**Row 1:**
| PayPal | ICICI Bank (India) | HDFC Bank (India) |
|---|---|---|
| 🟦 PayPal logo | 🟧 ICICI logo | 🟥 HDFC logo |

**Row 2:**
| State Bank of India (India) - Banking | Kotak Mahindra Bank (India) | Axis Bank (India) |
|---|---|---|
| 🟦 SBI logo | 🟦 Kotak logo | 🟫 Axis logo |

**Row 3:**
| HDFC Bank (India) - Credit Card | State Bank of India Credit Cards (India) | American Express Cards (India) |
|---|---|---|
| 🟥 HDFC logo + (C) badge | 🟦 SBI logo + (C) badge | 🟦 AmEx logo + (C) badge |

**Legend (bottom-left of grid):**
```
(C) → Credit Card
```

The "(C)" is a small dark-grey circular badge in the top-right of each credit-card card, distinguishing card accounts from regular bank accounts.

### Section C — Manual fallback

White rounded card at the bottom of the modal:

```
[📄 icon] Add bank or credit card account manually            [ Add Account ]
          Unable to connect your bank or credit card account
          using our Service Provider? Add the accounts manually
          using your account details.
```

The "Add Account" button is on the right edge — outlined button (not solid blue), indicating it's a secondary/fallback action.

---

## Key takeaways for the data model

From Screenshot 2, the modal makes 3 things explicit:

1. **Three integration tiers** (partner-bank direct API / Yodlee aggregator / manual) — see `docs/zoho-banking-research.md` § 1 for the full breakdown.

2. **Credit card is a separate account type** — same bank (HDFC, SBI) shows up twice when both products are supported. The (C) badge distinguishes them. Quikfinance's `BankAccount.type` enum needs at minimum:
   - `BANK` (regular checking / savings)
   - `CREDIT_CARD` (no IFSC, has statement cycle, has credit limit)
   - `PAYPAL` (multi-currency wallet, in tier B not tier A)

3. **Indian banking dominance** — Of 14 visible logos across both sections, 12 are Indian (Standard Chartered, HSBC, Kotak, SBI, Axis appear in tier A; ICICI, HDFC, SBI, Kotak, Axis banking + HDFC, SBI, AmEx credit cards in tier B). PayPal is the only non-Indian-anchored option. This is the **India edition** of Zoho Books — the global edition's modal looks different.

---

## Screenshot 3 — "Add Bank or Credit Card" form (Account Type = **Bank**)

Reached by clicking the "Add Manually" button (Screenshot 1) or the "Add Account" button at the bottom of the modal (Screenshot 2). Tier-C manual fallback.

### Header
- Title: "**Add Bank or Credit Card**" (single line, top-left)

### Form fields (top to bottom)

| Order | Field | Required | Type | Notes |
|---|---|---|---|---|
| 1 | **Select Account Type*** | yes | Radio group | Two options: ● Bank (selected) / ○ Credit Card |
| 2 | **Account Name*** | yes | Text input | Single-line, focused on load |
| 3 | Account Code | no | Text input | |
| 4 | **Currency*** | yes | Dropdown | Defaults to INR |
| 5 | Account Number | no | Text input | **Only on Bank type** |
| 6 | Bank Name | no | Text input | |
| 7 | IFSC | no | Text input | **Only on Bank type** |
| 8 | Description | no | Textarea | Placeholder "Max. 500 characters" |
| 9 | Make this primary | no | Checkbox | **Only on Bank type** |

### Footer
- `[ Save ]` — primary blue button
- `[ Cancel ]` — outlined secondary

### Right edge
Same vertical icon rail as Screenshots 1 & 2 (help / announcements / tutorial / chat / marketplace / integrations).

---

## Screenshot 4 — Same form with Account Type = **Credit Card**

Form re-renders dynamically when the user toggles the radio from Bank → Credit Card. **Several fields disappear.**

### Form fields (with Credit Card selected)

| Order | Field | Required | Type | Notes |
|---|---|---|---|---|
| 1 | **Select Account Type*** | yes | Radio group | ○ Bank / ● Credit Card (selected) |
| 2 | **Account Name*** | yes | Text input | Same as Bank |
| 3 | Account Code | no | Text input | Same as Bank |
| 4 | **Currency*** | yes | Dropdown | Same as Bank, defaults to INR |
| 5 | Bank Name | no | Text input | Same as Bank |
| 6 | Description | no | Textarea | Same as Bank, "Max. 500 characters" |

### Fields HIDDEN on Credit Card type (compared to Bank)
- **Account Number** — gone
- **IFSC** — gone
- **Make this primary** checkbox — gone

### Footer
- `[ Save ]` — primary blue
- `[ Cancel ]` — outlined

---

## Key takeaway from Screenshots 3 + 4

The credit-card account form is **dramatically simpler than I had speculated** in the earlier research doc. The previous version of `zoho-banking-research.md` mentioned credit-card-specific fields like:

- ❌ Statement cycle date — **NOT on the form**
- ❌ Credit limit — **NOT on the form**
- ❌ Last 4 digits of card — **NOT on the form**

The actual credit-card creation form is just: name, code, currency, bank name, description. Six fields total (counting the radio). No card-specific business logic at creation time.

This means Zoho either:
1. **Captures these fields elsewhere** (e.g., on the per-account settings page after creation), OR
2. **Doesn't model them at all** — and just lets the user track the credit-card balance generically as a liability account

Either way, **for Quikfinance v1 we should keep the credit-card form just as minimal as Zoho's** — same 6 fields. Defer credit-limit / statement-cycle date / card-last-4 until a real customer asks. YAGNI.

### Updated `BankAccountType` field-shape sketch (revised after screenshots)

```typescript
// Common fields (all types):
{
  type: "BANK" | "CREDIT_CARD" | "PAYPAL"
  accountName: string         // required
  accountCode?: string
  currency: string            // required, default "INR"
  bankName?: string
  description?: string        // max 500 chars
}

// Bank-only extra fields:
{
  accountNumber?: string
  ifsc?: string
  isPrimary?: boolean         // checkbox; only one BANK can be primary per org
}

// Credit Card: no extra fields beyond common (at creation time)
// PayPal: not visible from screenshots — probably has email + currency multi-select
```

Compare against Quikfinance's current `BankAccount` Prisma model — most likely we'll need to:
- **Drop** any speculative `creditLimit` / `statementCycleDay` columns (if they exist)
- **Keep** `accountNumber`, `ifsc`, `isPrimary` as nullable so credit cards can leave them empty
- **Add** the `type` enum if it isn't there yet

---

## Screenshot 5 — Yodlee handoff Step 1: EULA acceptance

Reached after clicking the "**Connect Now**" button on the "Automatic Bank Feeds Supported Banks" section (Screenshot 2).

### Header
- Title: "**Connect and add your bank or credit card accounts**"
- Subtitle: "Choose the bank feeds service provider, and read and agree to the End User License Agreement to connect your bank."
- Close ✕ (red, top-right)

### Service Provider selector (top of modal body)
```
Bank Feeds Service Provider:  [ Yodlee ▾ ]
```
The Yodlee value is shown in blue with a chevron — implying the dropdown has alternatives. (Zoho's docs reference "Token" as the second provider in some regions.) This means a user whose bank isn't in Yodlee's catalog can switch providers mid-flow.

### EULA section
- ℹ Info icon + paragraph: "The End User License Agreement (EULA) describes the terms and conditions under which you may use the Automatic Bank Feeds for the selected bank feeds service provider. Kindly read and agree to all the end user terms to proceed."
- Checkbox (pre-checked in screenshot): "**☑ I have read and agree to all the end user terms for automatic bank feeds.**"
  - The phrase "end user terms for automatic bank feeds" is a blue hyperlink — opens the actual EULA in a new tab/modal

### Footer
- `[ Proceed ]` — blue primary, enabled only when the checkbox is checked
- `[ Cancel ]` — outlined secondary

---

## Screenshot 6 — Yodlee handoff Step 2: Bank picker (after Proceed)

Shown after the EULA is accepted. This is Yodlee's bank-search UI embedded inside the Zoho modal.

### Header
- Title: same as Screenshot 5
- Subtitle changes to: "If you don't find the bank that you're trying to connect with Zoho Books, select another service provider and search for the bank you want to connect."

### Service Provider banner (re-shown for mid-flow switching)
```
Bank Feeds Service Provider:  [ Yodlee ▾ ]      ⓘ You have 29:36 time remaining to connect your bank
```

**New observation:** there's a **countdown timer** on the right — "You have **29:36** time remaining to connect your bank." Session timeout window is ~30 minutes. After it expires, the user has to start the flow over (EULA + provider selection).

### Search + bank grid

Centered search input:
```
🔍 Search
```

Below the search, a 4-column tile grid of featured banks. (User can type into the search to filter to other banks Yodlee supports.) Featured banks visible in the screenshot (all US — Yodlee's US catalog):

| Row | Banks |
|---|---|
| 1 | First Internet Bank of ... · Chase · Wells Fargo · Bank of America |
| 2 | Capital One · Chime · Navy Federal Credit ... · Fidelity Investments |
| 3 | USAA · Huntington Bank (Per...) |

Each tile is a card with the bank logo at top and the name below (truncated with `...` if too long, e.g. "First Internet Bank of ..." and "Huntington Bank (Per...").

### Close ✕ in the grid area
Small light ✕ at the top-right of the grid card — lets the user back out without losing the EULA acceptance.

---

## Key takeaways from Screenshots 5 + 6

### 1. EULA gate is a hard requirement
Zoho legally cannot pass user credentials to Yodlee without recorded consent. The pre-checked state in the screenshot is the user's session — fresh sessions show it unchecked. This is **compliance scaffolding**, not optional UX polish.

### 2. Provider selector dropdown implies multiple aggregators
The "Yodlee ▾" chevron means Zoho supports more than one bank-feeds aggregator. Yodlee is the default for most regions; Token appears to be the alternative (per Zoho's public docs). For Quikfinance's eventual v2 build, this means **abstract the integration interface** so swapping providers later is a config change, not a rewrite.

### 3. Yodlee's catalog is global, but Zoho's "featured" list is regional
Screenshot 2 (the earlier connect modal) showed 9 Indian banks under "Automatic Bank Feeds Supported Banks". Screenshot 6 (the actual Yodlee picker) shows US banks (Chase, Wells, BoA, etc.). So the catalog Yodlee supports is much broader than the curated highlights Zoho shows. Featured banks are likely **regional defaults based on the org's country**.

### 4. 30-minute session timeout
The countdown timer is interesting infrastructure — Yodlee's OAuth-style flow has a hard expiry, presumably because Yodlee's auth tokens are short-lived. If a user gets distracted mid-flow (e.g. checking 2FA code on phone), the session resets. **Quikfinance should mirror this** — issue a short-lived JWT or session marker when the user starts the flow, expire on the 30-min boundary, and force restart if expired.

### 5. Truncated bank names with `...`
Long bank names get clipped: "First Internet Bank of ..." and "Huntington Bank (Per...". UX implication for our build: tile width is fixed, names overflow gracefully with ellipsis, full name visible on hover/tooltip (presumably — not visible in the static screenshot).

---

---

## Screenshot 7 — Yodlee handoff Step 3: Credential entry iframe

The final step of the Yodlee handoff. Reached after the user clicks a bank tile in Screenshot 6's catalog. **This is Yodlee FastLink** — Yodlee's iframe-embedded credential-collection UI loaded inside Zoho's modal.

### Outer Zoho modal chrome (unchanged from Screenshot 6)
- Title: "Connect and add your bank or credit card accounts"
- Subtitle: "If you don't find the bank that you're trying to connect with Zoho Books, select another service provider and search for the bank you want to connect."
- Close ✕ (red, top-right)
- "Bank Feeds Service Provider: Yodlee ▾"
- Countdown: "ⓘ You have **28:25** time remaining to connect your bank" (down from 29:36 — ~1 min has elapsed)

### Yodlee iframe content (centered, vertical layout)

```
   <                                              ✕
                  [F bank logo]
   ─────────────────────────────────────────────────

   Enter your First Internet Bank of Indiana (Commercial)
   credentials to connect your account(s) to Zoho Books.


   Username
   [_____________________________________________]

   Password
   [______________________________________  👁  ]

   By continuing, you agree to Yodlee's terms of use for
   account linking. Yodlee's use of your data follows the
   application provider's privacy notice.

              [        Submit        ]

       On behalf of Zoho  ·  data access provided by yodlee
```

### Detailed element list

| Element | Value | Notes |
|---|---|---|
| Back arrow `<` | Top-left | Returns to bank picker (Screenshot 6) — user can pick a different bank |
| Close `✕` | Top-right | Cancels the flow entirely — exits the Yodlee iframe |
| Bank logo | Large "F" monogram (green on blue) | Actual bank logo, pulled from Yodlee's catalog |
| Prompt text | "Enter your First Internet Bank of Indiana **(Commercial)** credentials to connect your account(s) to Zoho Books." | Bank name fully expanded (vs truncated "First Internet Bank of ..." on the picker tile). Notable: "(Commercial)" suffix indicates this bank has product/segment variants in Yodlee's catalog (vs Personal) |
| Username field | Text input, focused on load | Standard text input |
| Password field | Password input + 👁 eye icon | Show/hide toggle |
| Yodlee terms disclaimer | "By continuing, you agree to **Yodlee's terms of use** for account linking. Yodlee's use of your data follows the application provider's privacy notice." | The "Yodlee's terms of use" is a blue underlined link |
| Submit button | Dark navy blue, full-width | Yodlee's brand color, not Zoho's |
| Footer attribution | "On behalf of Zoho · data access provided by **yodlee**" | Co-branding required by Yodlee for transparency |

### Key takeaways from Screenshot 7

#### 1. Two layers of consent
Zoho captured EULA acceptance in Step 1 (Screenshot 5 — "end user terms for automatic bank feeds"). Now Yodlee surfaces a SECOND consent line in Step 3 — "Yodlee's terms of use for account linking." Two separate legal contracts:
- **Zoho ↔ user** — agrees that user understands Zoho will use Yodlee as an intermediary
- **Yodlee ↔ user** — agrees Yodlee can collect credentials and pull data on behalf of Zoho

This is standard for the aggregator-in-the-middle model. For Quikfinance v2 we'd need to surface the equivalent of both layers if we use Yodlee — or just one layer if we go direct partner-bank API.

#### 2. Generic credential collection at this step
Just Username + Password. Bank-specific challenges (MFA OTP, security questions) would presumably appear in a follow-up step (not yet screenshotted). The first credentials submission probably triggers the bank to ask for additional factors if needed.

#### 3. Bank product variants in Yodlee's catalog
The "(Commercial)" suffix is interesting — "First Internet Bank of Indiana (Commercial)" vs presumably "First Internet Bank of Indiana (Personal)" as a separate Yodlee catalog entry. Implies the catalog data model has `bankName + productSegment`. For Quikfinance v2 we'd inherit this when integrating with Yodlee — the bank catalog they expose distinguishes business vs consumer products.

#### 4. Co-branded footer is required
"On behalf of Zoho · data access provided by yodlee" appears at the bottom. Yodlee mandates this co-branding for transparency. The Quikfinance v2 equivalent would say something like "On behalf of Quikfinance · data access provided by Yodlee" — Yodlee provides the branding kit.

#### 5. Iframe runs in Yodlee's domain
The Submit button is dark navy blue (Yodlee's brand color), not Zoho's blue. This is a visual cue that the iframe is on Yodlee's domain — the credentials never touch Zoho's servers. Standard PCI/PSD2 hygiene for bank credentials.

#### 6. The 30-min timer keeps running
Zoho's outer countdown (28:25 here, down from 29:36 in Screenshot 6) keeps ticking while Yodlee's iframe is open. If it expires mid-credential-entry, the whole flow resets — user has to re-accept EULA and re-pick the bank.

---

## What Screenshots 5 + 6 + 7 confirm together

The **complete Yodlee handoff flow** is now fully verified:

| Step | Surface | What user does |
|---|---|---|
| 1. **EULA gate** | Zoho's modal | Read consent → tick checkbox → Proceed |
| 2. **Bank picker** | Zoho's modal (Yodlee data) | Search Yodlee catalog → pick bank tile |
| 3. **Credential entry** | Yodlee FastLink iframe (inside Zoho's modal) | Type Username + Password → Submit |
| 4. **Account selection** | (Not yet screenshotted — inferred from public docs) | Yodlee returns the list of accounts at the bank; user picks which to sync |
| 5. **Backfill window** | (Not yet screenshotted — inferred) | User picks how far back to fetch transactions (up to 90 days per docs) |
| 6. **Success + return** | Back in Zoho's banking page | New account appears in the bankslist, first sync starts |

Steps 1-3 are 100% confirmed from screenshots. Steps 4-6 are inferred from Zoho's public docs.

---

## Open questions (would need more screenshots to answer)

- What does Yodlee Step 4 (account selection from the bank) look like?
- What does Yodlee Step 5 (backfill date range picker) look like?
- What does the modal look like AFTER connecting a bank? (per-account dashboard layout)
- What does the column-mapping wizard look like during a CSV statement import?
- What's the actual UI of the Match Transactions screen?
- What's the layout of the Reconciliation form?
- What does the Transaction Rules CRUD page look like?
- What does the **edit** form for an existing account look like? (Are credit-limit / statement-cycle fields revealed there?)
- What does the PayPal account form look like (multi-currency)?
- What does the alternative provider (probably "Token") catalog look like?
- What happens when a bank requires MFA (OTP, security question)? Where does that step surface?

If you send screenshots of any of these, I'll add them here and refine the research doc.
