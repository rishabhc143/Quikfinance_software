# Merging Quikfinance into Quikit — design options

**Status:** Draft / discussion. No code changes yet. Author: Claude + Rishabh.
**Date:** 2026-05-12
**Target:** Surface Quikfinance as an app inside the Quikit platform at <https://quik-it-auth.vercel.app/apps>.

---

## TL;DR

There are four realistic ways to "merge" Quikfinance into Quikit. They differ wildly in scope, time, and what end-users actually experience:

| Option | What user sees | Engineering effort | Recommended? |
|---|---|---|---|
| **A. SSO redirect** | Click "Quikfinance" in Quikit's `/apps` → hops to `quikfinance.vercel.app` with their identity pre-established. Two domains, two URL bars. | 1–2 weeks | ✅ **Start here** |
| **B. Iframe embed** | Quikfinance renders inside Quikit's chrome at `quikit.com/apps/quikfinance`. Looks unified, one URL. | 2–3 weeks | 🟡 Only if a unified UI is non-negotiable |
| **C. Reverse-proxy mount** | Quikit fronts Quikfinance at `quikit.com/apps/quikfinance/*` via Vercel rewrites. Same-origin cookies. | 2–4 weeks | 🟡 More complex than it looks (asset URLs, cookies) |
| **D. Full code merge** | One monorepo, one Vercel project, one DB. | 2–3 months | ❌ Too heavy unless you're consolidating products |

**Recommendation:** Ship **Option A (SSO redirect)** as Phase 1. It unblocks the user-visible win — Quikfinance appears as a tile in Quikit's app launcher — without committing to deep integration. Phase 2 can layer Option B or C on top later.

---

## What I learned about Quikit

From probing the public surface (without logging in, since you asked me to stop):

- **Two Vercel apps, not one:**
  - `auth-quikit.vercel.app` — identity provider (login page, brand "QuikIT")
  - `quik-it-auth.vercel.app` — application shell (redirects unauthenticated users to the auth app)
- **Strict frame headers** on the shell:
  - `X-Frame-Options: SAMEORIGIN`
  - CSP `frame-ancestors 'none'`
  - **Implication:** Quikit refuses to be embedded inside other apps (good security hygiene). For embedding *Quikfinance* inside Quikit (Option B), this matters less — but it confirms the team takes the security model seriously, so any integration we propose has to clear the same bar.
- `/apps` is the launcher route — auth-gated. Based on the URL pattern, it's almost certainly a "tile-grid of apps" page similar to Microsoft 365's launcher or Zoho One's home.
- Stack uses Sentry for observability, lives entirely on Vercel.

**Assumption I'm making:** you own both Quikit and Quikfinance (you handed me admin credentials for both, and asked to "merge" them). If Quikit is actually a third-party platform you don't control, ignore Section "Quikit-side changes" below — you'd need to follow whatever public integration API Quikit publishes.

---

## Option A — SSO Redirect (recommended Phase 1)

### What it looks like
1. User logs into Quikit at `auth-quikit.vercel.app`
2. Lands on Quikit's `/apps` page
3. Clicks the **Quikfinance** tile
4. Quikit generates a short-lived signed JWT carrying `{ sub, email, name, tenantId, exp }`
5. Browser is redirected to `https://quikfinance-software.vercel.app/api/auth/sso?token=<jwt>`
6. Quikfinance verifies the JWT (HS256 with a shared secret OR RS256 with Quikit's public key), upserts the user + their organization, sets a NextAuth session cookie, and redirects to `/`
7. User lands on Quikfinance dashboard, authenticated

### Why this is the right Phase 1
- **No iframe gymnastics.** Quikfinance keeps its current domain, URL bar, cookie path.
- **No reverse proxy needed.** Vercel routes stay flat.
- **Reversible.** If you decide to roll back, you delete one route + remove the tile from Quikit. No code-merge debt.
- **Each app keeps its own deploy / release cadence.** Quikfinance's CI doesn't entangle with Quikit's.
- **Auth model already exists in Quikfinance.** NextAuth supports custom credential providers — adding an SSO entry point is just one new route handler.

### Quikfinance-side changes

| File | Change | Lines |
|---|---|---|
| `app/api/auth/sso/route.ts` | **NEW** — GET handler that verifies JWT, creates/looks up user + org via Prisma, calls NextAuth's `signIn("credentials", { sso: true })`, redirects to `/`. Bound to the env-defined Quikit issuer. | ~80 |
| `lib/auth.ts` | Add a second `Credentials` provider with `id: "quikit-sso"` that trusts a pre-verified user payload. Existing email/password provider stays. | +30 |
| `lib/quikit-sso.ts` | **NEW** — JWT verification + user-provisioning helper. Reuses `jose` (Anthropic SDK already pulls it in transitively) or installs `@panva/jose`. | ~120 |
| `.env.example` | Add `QUIKIT_SSO_ISSUER`, `QUIKIT_SSO_AUDIENCE`, `QUIKIT_SSO_SECRET` (HS256) **or** `QUIKIT_SSO_JWKS_URL` (RS256). | +4 |
| `prisma/schema.prisma` | Add `User.quikitId String? @unique` and `Organization.quikitTenantId String? @unique` so we don't accidentally create duplicate users/orgs when the same Quikit identity signs in twice. New migration. | +2 |
| `middleware.ts` | Allow-list `/api/auth/sso` in the public-paths array so the JWT can be verified before middleware redirects to `/login`. | +1 |
| `app/(auth)/login/form.tsx` | (Optional) Add a **"Sign in with Quikit"** button that links to `https://auth-quikit.vercel.app/login?return=quikfinance` so users can start the flow from Quikfinance too. | +15 |
| `tests/unit/sso.test.ts` | **NEW** — JWT verification, expired-token rejection, signature-mismatch rejection, user-upsert idempotency. | ~80 |
| `tests/e2e/quikit-sso.spec.ts` | **NEW** — Playwright spec that mints a test JWT with a known dev secret, GETs `/api/auth/sso?token=...`, asserts session cookie + dashboard renders. | ~100 |
| `DECISIONS.md` | New entry: "D77 — SSO from Quikit via signed JWT (HS256), users provisioned on first hit." | +10 |
| `README.md` | New section "Quikit SSO" with env-var setup + how to issue test tokens locally. | +25 |

**Total: ~470 LOC of new code, ~50 LOC modified.**

### Quikit-side changes (assuming you own Quikit)

| File | Change |
|---|---|
| `apps/[tile-grid]/page.tsx` | Add a new app tile with `{ id: 'quikfinance', name: 'Quikfinance', icon: '/icons/quikfinance.svg', launchUrl: '/api/launch/quikfinance' }`. |
| `app/api/launch/quikfinance/route.ts` | **NEW** — issues a short-lived JWT (5 min exp) with the current user's identity and redirects to `https://quikfinance-software.vercel.app/api/auth/sso?token=<jwt>`. |
| `lib/sso-tokens.ts` (or wherever Quikit signs tokens) | Add a per-app key registry: `{ quikfinance: { secret: process.env.QUIKFINANCE_SSO_SECRET, audience: 'quikfinance' } }`. |
| Env vars | `QUIKFINANCE_SSO_SECRET` (matches what Quikfinance has on its side). Generated via `openssl rand -hex 32`. |

If Quikit already has an internal launch-token pattern for other apps, follow that — the spec above is what a clean implementation looks like, not necessarily what fits your existing Quikit code.

### Security checklist (Phase 1)
- [ ] JWT max lifetime 5 minutes — too short to replay, long enough for slow networks
- [ ] Audience claim (`aud: 'quikfinance'`) enforced — token for one app can't unlock another
- [ ] One-time-use jti tracked in Quikfinance for ~10 min — defeats replay even within the 5-min window
- [ ] Shared secret stored as `encrypted` env var on Vercel (both sides)
- [ ] HTTPS-only redirects (already enforced by HSTS)
- [ ] Quikfinance audit log writes a `SsoSignIn` event with `quikitTenantId` + `userId` for every successful exchange
- [ ] No JWT logged anywhere (Sentry breadcrumb filter)

### Effort estimate
- **Design + Quikit-side launch endpoint:** 2 days
- **Quikfinance `/api/auth/sso` route + JWT verifier + user provisioning:** 3 days
- **Tests (unit + Playwright):** 2 days
- **Docs + DECISIONS update:** 0.5 days
- **End-to-end manual smoke + bug fixes:** 1.5 days
- **Total: ~9 working days (~2 weeks calendar).**

---

## Option B — Iframe Embed (Phase 2, optional)

### What it looks like
Same as Option A *plus*: Quikit's `/apps/quikfinance` route renders a full-page iframe `<iframe src="https://quikfinance-software.vercel.app/?embedded=true" />`. User stays on the Quikit domain in their URL bar.

### Why not yet
- **Cross-domain cookies** need `SameSite=None; Secure` — works on every modern browser but is more fragile than top-level navigation.
- **The dashboard layout's sidebar** is duplicated visual chrome — Quikit's chrome + Quikfinance's sidebar. Either we hide Quikfinance's sidebar in `?embedded=true` mode (extra branching) or we get a doubled UI.
- **Modals + popovers** (Radix UI) sometimes break when the page is in an iframe with `clip-path` ancestors. Fixable but adds polish cycles.
- **PDF download links + email send routes** need to work in cross-frame contexts — `target="_blank"` is fine, but the print preview iframe behaviour differs.

If you want this *and* SSO, it's roughly **+1 week on top of Option A**. The two are additive — you don't have to pick.

### Files that would change beyond Option A
- `app/(dashboard)/layout.tsx` — conditional `searchParams.embedded === 'true'` branch that hides Sidebar + TopHeader + RightRail.
- `next.config.mjs` — relax `X-Frame-Options` to allow framing by `https://quik-it-auth.vercel.app` specifically.
- `app/(dashboard)/page.tsx` (and all dashboard pages indirectly) — ensure cookies use `SameSite=None`.
- `middleware.ts` — allow the `?embedded` query param to pass through without redirect chains.

---

## Option C — Reverse-Proxy Mount (alternate Phase 2)

### What it looks like
Quikit's Vercel config rewrites `quikit.com/apps/quikfinance/*` → `quikfinance-software.vercel.app/*`. Same-origin from the browser's perspective — cookies set on `quikit.com` flow naturally.

### Why this is harder than it sounds
- **Every asset URL** (CSS, fonts, `_next/static/*`, Razorpay iframe, AI streaming endpoint) needs the proxy path prefix or absolute URLs. Next.js doesn't make this trivial without a `basePath` config — and `basePath` is a build-time decision, meaning Quikfinance has to build differently when deployed *through* the proxy vs standalone. Two deploy targets.
- **OAuth callbacks** (Google sign-in, Razorpay webhook) need stable URLs — they can't bounce through a proxy.
- **Cron jobs** (`/api/cron/recurring-bills` etc.) need to hit the underlying Quikfinance URL directly, not the proxy.

You'd pick this **only** if the unified URL is critical AND iframe doesn't satisfy the UX requirement. Estimate: **3–4 weeks** including the asset-URL refactor.

---

## Option D — Full Code Merge (probably wrong)

Lift `app/(dashboard)/**`, `lib/**`, `prisma/schema.prisma` from Quikfinance into Quikit's monorepo. Share the auth + DB. Single Vercel deploy.

**Reasons to do this:** you want one product, not two. Marketing, billing, support all unified.

**Reasons not to do this:**
- Quikfinance has its own Prisma schema (~50 tables, 14 migrations) — merging with Quikit's schema is a careful migration on production data
- Different release cadences become impossible — every Quikit deploy redeploys all of Quikfinance's complexity
- Rollback is no longer "remove a tile" — it's a database migration in reverse
- Test surface area triples

**Estimate:** 2–3 months. Don't pick this unless you've already decided Quikfinance is a feature of Quikit, not a separate product.

---

## Phased plan (recommended)

```
Phase 1 (week 1-2)  → Option A: SSO redirect ships
                       Tile in Quikit /apps clicks through to Quikfinance.
                       Two URLs, one identity.

Phase 2a (week 3-4) → IF you want unified UI: layer Option B (iframe) on top
                       Quikfinance renders inside Quikit's chrome.
                       Hide Quikfinance sidebar in embedded mode.

Phase 2b (week 5+)  → OR: Option C (reverse proxy) for single-URL feel
                       Bigger lift; only if iframe UX is rejected.

Phase 3 (future)    → Eventually data integration:
                       — Quikit's user directory ↔ Quikfinance's Contact table
                       — Quikit's billing ↔ Quikfinance subscription state
                       — Single audit log feed
```

---

## Open questions (need your call before Phase 1 starts)

1. **Who owns Quikit?** If it's a third-party platform, do they publish a developer API? Send me the docs link.
2. **Does Quikit already have an SSO pattern for other apps?** If yes, we follow it instead of inventing. (You'd know — what do other apps in `/apps` use?)
3. **One Quikfinance tenant per Quikit tenant, or many?** Affects whether `Organization.quikitTenantId` is unique or not.
4. **What happens on sign-out?** Quikfinance sign-out kills only the Quikfinance session, or propagates back to Quikit? (Standard answer: kill only Quikfinance — Quikit signs the user out via its own flow.)
5. **Provisioning flow for net-new users.** Does a Quikit user clicking the tile automatically get a Quikfinance org with a starter chart-of-accounts (same as the signup flow), or does the Quikit admin pre-provision?

---

## Risks + rollback

| Risk | Mitigation |
|---|---|
| Shared SSO secret leaks | Rotate via env var update + redeploy; 5-min token TTL means damage window is tiny |
| Quikit's auth changes break Quikfinance SSO | Add Sentry alert on SSO endpoint 4xx/5xx rate; Quikit-side regression tests |
| User upserts create duplicate orgs | `Organization.quikitTenantId @unique` enforces this at the DB level |
| Quikfinance breaks an app feature (e.g., Razorpay) due to embedded-mode quirks | Phase 1 (Option A) avoids this entirely — Quikfinance stays standalone |

**Rollback for Phase 1:** Remove the Quikfinance tile from Quikit's `/apps`. Direct users back to `quikfinance-software.vercel.app/login`. No code revert needed on the Quikfinance side beyond optionally disabling the SSO route via an env-var feature flag.

---

## What I need from you to start Phase 1

1. **Decision on Option A vs B** (or "do both, A first").
2. **Confirmation you own both apps** (or pointer to Quikit's dev docs if not).
3. **Where Quikit's apps registry lives** in their codebase — file path or repo URL. I'll mirror their existing app-tile format.
4. **Shared secret strategy:** HS256 (one shared secret, simpler) vs RS256 (Quikit publishes a JWKS URL, more standard). Default recommendation: HS256 for Phase 1, migrate to RS256 if you add more apps later.

Once those four are answered, Phase 1 is a clean 2-week PR.
