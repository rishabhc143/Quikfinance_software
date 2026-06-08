# Tally Companion — why "Companion" not "Migration"

> One-pager on the strategic decision behind this module. Full rationale + alternatives considered live in `DECISIONS.md` D90.

## The decision

We chose to build a **Tally Companion** — a read-only data layer that ingests the customer's Tally exports and runs Quikfinance's AI features (forecast, Copilot, anomaly detector) on top — **instead of a Tally Migration** that would have customers leave Tally on Day 1 and import all their books into Quikfinance as system-of-record.

## Why Companion wins

| Concern | Migration-mode | Companion-mode |
|---|---|---|
| **Customer Day-1 ask** | "Abandon 5+ years of Tally and trust us" | "Keep using Tally. We'll add AI on top." |
| **CA acceptance** | CA must change their filing workflow | CA workflow unchanged — they still file from Tally |
| **Trust required upfront** | High — customer is betting their books | Low — Tally remains source of truth |
| **Round-trip fidelity** | Must be near-perfect; data loss is fatal | One-way ingest; lossy is acceptable + transparent |
| **Reputation risk** | One bad import = lost market via CA WhatsApp groups | Worst case = "Quikfinance miscounted X" — fixable |
| **Tally Solutions IP exposure** | Risky if writing back via TDL / HTTP-XML | Zero — public XML schema, read-only |
| **Cannibalisation** | Free import + free export = customer pays nothing | Companion tier = permanent recurring revenue |
| **Conversion blocker** | High — most prospects walk away | Removed — easy "try us alongside Tally" pitch |

## What this gives us strategically

1. **Wedge into the market.** The #1 SMB acquisition blocker is *"but I have 5 years of data in Tally."* Companion eliminates it without asking the customer to commit on Day 1.

2. **Same engine, two products.** The parser pipeline that powers Companion is the same one that powers eventual full migration. We spend Sprint-1 engineering once, get two products.

3. **AI features unlock immediately.** All of CF-1 → CF-7 (cashflow forecast, payment-delay learning, stress test, CFO Copilot, anomaly detector) work on Companion data the moment it's imported. Customer sees real value on their real books in <5 minutes.

4. **Trust compounds, then migration becomes their idea.** After 60–90 days of Companion mode, customers ask *"can I just do my data entry here too?"* — at which point a "promote to native" workflow (Session 2+) is opt-in, low-friction, and built on months of reconciliation history.

5. **Legally clean.** Reading Tally's publicly-documented XML schema has zero IP exposure. We never touch Tally Server licenses, TDL plugins, or HTTP-XML write APIs.

## What we explicitly give up

- **Some customers stay in Companion forever** — never fully migrate. **That's fine** — they pay for the AI tier regardless. Recurring revenue without recurring conversion pressure.
- **Tally Solutions stays in the value chain.** We don't displace them. We augment.
- **No two-way live sync (yet).** Customer exports XML manually (or emails it monthly). Phase 3+ may add Tally Server HTTP-XML pull, but only after legal review.

## What Sprint 1 ships (this PR)

```
File ── (Tally Prime parser) ──► Canonical types ──► Mapper ──► Companion* tables
                                       ▲
                                       │ Future parsers (Zoho, QB, Marg)
                                       │ all produce the same canonical
                                       │ format — adding a source = adding
                                       │ a parser, nothing else.
```

| File | Purpose |
|---|---|
| `lib/migration/canonical.ts` | Source-agnostic intermediate format (`CanonicalLedger`, `CanonicalVoucher`, `ParseResult`, `FormatParser` interface) |
| `lib/migration/parsers/tally-prime.ts` | Tally Prime XML parser; v1 covers Ledgers + Sales vouchers; unsupported types surfaced as warnings, not errors |
| `lib/migration/mapper.ts` | Pure mapper: canonical → Prisma `createMany` rows |
| `prisma/migrations/20260614000000_tally_companion_v1/` | `MigrationBatch`, `CompanionLedger`, `CompanionVoucher` tables — additive only, idempotent re-import via partial unique index |
| `app/api/companion/upload/route.ts` | Multipart upload endpoint, 10MB cap, single transaction |
| `app/(dashboard)/settings/data/tally-companion/` | Landing page with upload widget + history list |

## What's coming next (Sprint 2+)

- **Vouchers v2** — Purchase, Receipt, Payment, Journal, Credit/Debit Note, Contra
- **Forecast on Companion data** — make `computeForecast` read from `CompanionVoucher` as well as native `Invoice`/`Bill`, so the 12-week forecast works on Tally data without further customer effort
- **Reconciliation report** — auto-generated PDF showing Tally Trial Balance vs Quikfinance Trial Balance side-by-side; signature line for CA sign-off
- **Rollback UI** — one-click undo within the 30-day window stored on `MigrationBatch.rollbackExpiresAt`
- **Promote Companion → native** — when a customer is ready to switch fully; same canonical pipeline, just writes to native entities instead of shadow tables
- **More parsers** — Zoho Books XML, QuickBooks QBO, Marg, BUSY, Vyapar (each a new file under `parsers/`, no changes to downstream code)
- **Background processing** — files >10MB handled via a worker queue, progress streamed to the UI

## Decision authority

Strategic call made jointly during a brainstorming session 5 June 2026. Full alternatives considered + roadblock analysis lives in `DECISIONS.md` D90.

If a future maintainer is tempted to re-pitch this as "Tally Migration" instead, please re-read D90 first — the analysis already covered why that path has ~40 distinct blockages that Companion-mode trivialises.
