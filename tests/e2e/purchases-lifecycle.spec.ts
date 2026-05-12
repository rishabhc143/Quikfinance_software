import { test, expect } from "@playwright/test";
import {
  cleanupPurchasesLifecycleFixtures,
  disconnectDb,
  seedPurchasesLifecycleFixtures,
  type PurchasesLifecycleFixtures,
} from "./_helpers";

const ADMIN_EMAIL = "admin@quikfinance.dev";
const ADMIN_PASSWORD = "Quikfinance!123";

async function signInViaApi(page: import("@playwright/test").Page) {
  const csrfRes = await page.request.get("/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const res = await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      callbackUrl: "/",
    },
    maxRedirects: 0,
  });
  expect([200, 302]).toContain(res.status());
}

/**
 * PR #108 — Acceptance criteria #19: full purchases lifecycle.
 *
 * Mirrors `tests/e2e/sales-receivables-loop.spec.ts` for the
 * vendor-side flow:
 *
 *   sign in
 *     → create purchase order (vendor combobox, 1 line, Save as Draft)
 *     → Mark as Issued (status DRAFT → ISSUED)
 *     → Convert to Bill (redirects /purchases/bills/new?fromPO=…)
 *     → fill manual bill number + Save as Open (status DRAFT → OPEN)
 *     → click Record payment (navigates to payments-made/new with
 *       ?vendor=…&bill=… pre-fill — amount auto-fills from the bill's
 *       outstanding balance)
 *     → Save as Paid
 *     → return to bill detail → assert status flips to PAID
 *
 * Vendor + service item are pre-seeded via Prisma in `beforeAll` so
 * the spec avoids the brittle inline-create combobox path. Bill
 * number is stamp-derived so reruns don't collide on the
 * (orgId, vendorId, number) soft-unique index.
 */
test.describe("Purchases lifecycle (acceptance #19)", () => {
  test.setTimeout(180_000);

  let fixtures: PurchasesLifecycleFixtures;
  const stamp = Date.now();
  const billNumber = `E2E-BILL-${stamp}`;

  test.beforeAll(async () => {
    fixtures = await seedPurchasesLifecycleFixtures(stamp);
  });

  test.afterAll(async () => {
    if (fixtures) await cleanupPurchasesLifecycleFixtures(fixtures);
    await disconnectDb();
  });

  test("vendor → PO → bill → payment → Paid", async ({ page }) => {
    await signInViaApi(page);

    // ───── 1. Create PO ───────────────────────────────────────────
    await page.goto("/purchases/orders/new");
    await expect(
      page.getByRole("heading", { level: 1, name: /new purchase order/i })
    ).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("po-vendor-combobox").click();
    await page.keyboard.type(fixtures.vendorName);
    await page
      .getByRole("option", { name: new RegExp(fixtures.vendorName, "i") })
      .first()
      .click();

    // Line items table uses canonical testids from the shared primitive.
    await page.getByTestId("line-item-name-0").fill("Office supplies");
    await page.getByTestId("line-item-rate-0").fill("1500");
    // Tab out of the rate field so React commits the controlled-input
    // change and the TransactionLineItemsTable's onChange useEffect
    // flushes the new `lines` state up to the parent form. Without an
    // explicit blur, a fast Playwright click can fire before the
    // effect runs and the parent submits with an empty `lines` array
    // (validator toasts "Add at least one line item" + page stays
    // on /new).
    await page.getByTestId("line-item-rate-0").blur();
    // Assert the input is committed to the typed value as a positive
    // signal that React state has settled before we submit.
    await expect(page.getByTestId("line-item-rate-0")).toHaveValue("1500", {
      timeout: 5_000,
    });

    await page.getByTestId("po-save-as-draft-button").click();
    // Match a CUID-style ID specifically so a failed save (which would
    // leave the URL at `/purchases/orders/new`) is caught here rather
    // than masking as a missing testid further down.
    await expect(page).toHaveURL(/\/purchases\/orders\/c[a-z0-9]{20,}$/, {
      timeout: 30_000,
    });

    // ───── 2. Mark Issued ──────────────────────────────────────────
    // Wait for the detail page to fully hydrate — the Mark Issued
    // button is in the action bar that renders after `requireOrganization`
    // + DB fetch resolve. We give it a generous timeout and dump page
    // diagnostics when it doesn't appear so CI failures are debuggable.
    const markIssuedBtn = page.getByTestId("mark-po-issued-button");
    try {
      await expect(markIssuedBtn).toBeVisible({ timeout: 30_000 });
    } catch (err) {
      // Surface what's actually on the page so we can fix the spec or
      // the SUT instead of staring at a screenshot.
      const url = page.url();
      const heading = await page.locator("h1").first().textContent().catch(() => null);
      const statusBadge = await page
        .locator("h1 ~ * .badge, h1 + div, [class*='Badge']")
        .first()
        .textContent()
        .catch(() => null);
      const visibleButtons = await page
        .locator("button")
        .allTextContents()
        .catch(() => []);
      throw new Error(
        `Mark Issued button not visible. url=${url} h1=${heading} status=${statusBadge} buttons=${JSON.stringify(visibleButtons)}\nOriginal: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    await markIssuedBtn.click();
    await expect(page.getByText(/^ISSUED$/).first()).toBeVisible({
      timeout: 15_000,
    });

    // ───── 3. Convert to Bill ──────────────────────────────────────
    await page.getByTestId("convert-po-to-bill-button").click();
    // The action does `redirect("/purchases/bills/new?fromPO=…")`.
    await expect(page).toHaveURL(/\/purchases\/bills\/new\?fromPO=/, {
      timeout: 30_000,
    });

    // ───── 4. Fill manual bill # + Save as Open ────────────────────
    await page.getByTestId("bill-number-input").fill(billNumber);
    await page.getByTestId("bill-save-as-open-button").click();
    // Same CUID-strictness rationale as the PO save step.
    await expect(page).toHaveURL(/\/purchases\/bills\/c[a-z0-9]{20,}$/, {
      timeout: 30_000,
    });
    // Capture the bill id so we can return here after the payment redirect.
    const billUrl = page.url();
    const billIdMatch = billUrl.match(/\/purchases\/bills\/([^/?#]+)/);
    if (!billIdMatch) throw new Error("Bill id not in URL");
    const billDetailPath = `/purchases/bills/${billIdMatch[1]}`;

    await expect(page.getByText(/^OPEN$/).first()).toBeVisible({
      timeout: 15_000,
    });

    // ───── 5. Record payment ───────────────────────────────────────
    await page.getByTestId("record-payment-link").click();
    await expect(page).toHaveURL(/\/purchases\/payments-made\/new\?/, {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { level: 1, name: /record payment/i })
    ).toBeVisible({ timeout: 30_000 });

    // The amount field auto-fills with the bill's outstanding balance
    // when the URL includes ?vendor=&bill=. We assert the auto-fill
    // landed (any non-empty numeric) and submit.
    const amountInput = page.getByTestId("payment-amount-input");
    await expect(amountInput).not.toHaveValue("", { timeout: 15_000 });

    await page.getByTestId("payment-save-as-paid-button").click();
    // The createBillPaymentAction redirects to
    // `/purchases/payments-made/<id>` on success — match CUID
    // specifically so a stuck-on-/new state can't pass silently.
    await expect(page).toHaveURL(/\/purchases\/payments-made\/c[a-z0-9]{20,}$/, {
      timeout: 30_000,
    });

    // ───── 6. Verify Bill status flipped to PAID ───────────────────
    await page.goto(billDetailPath);
    await expect(page.getByText(/^PAID$/).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
