import { test, expect } from "@playwright/test";
import {
  cleanupLifecycleFixtures,
  disconnectDb,
  seedLifecycleFixtures,
  type LifecycleFixtures,
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
 * M19: rewritten receivables lifecycle test (acceptance #15).
 *
 * Walks the round-trip:
 *   sign in
 *     → create quote (UI form, line item, save as draft)
 *     → mark quote as Sent (data-testid action button)
 *     → convert quote → invoice (data-testid action)
 *     → mark invoice as Sent
 *     → record full payment via dialog (data-testid form fields)
 *     → assert invoice status flips to PAID
 *
 * Customer + Item are pre-seeded via Prisma in `beforeAll` so the
 * brittle combobox inline-create path is bypassed entirely. State
 * transitions go through deterministic data-testid selectors.
 */
test.describe("Sales receivables lifecycle (acceptance #15)", () => {
  test.setTimeout(120_000);

  let fixtures: LifecycleFixtures;

  test.beforeAll(async () => {
    fixtures = await seedLifecycleFixtures(Date.now());
  });

  test.afterAll(async () => {
    if (fixtures) await cleanupLifecycleFixtures(fixtures);
    await disconnectDb();
  });

  test("customer → quote → invoice → payment → Paid", async ({ page }) => {
    await signInViaApi(page);

    // 1. Create quote -------------------------------------------------------
    await page.goto("/sales/quotes/new");
    await expect(
      page.getByRole("heading", { level: 1, name: /^new quote$/i })
    ).toBeVisible({ timeout: 30_000 });

    // Customer combobox — open and pick the seeded customer by visible name
    await page.getByTestId("quote-customer-combobox").click();
    await page.keyboard.type(fixtures.customerName);
    await page
      .getByRole("option", { name: new RegExp(fixtures.customerName, "i") })
      .first()
      .click();

    // Line item — first row's name + rate via deterministic testids.
    // The line-item combobox starts un-selected so the custom-name
    // fallback input is visible (placeholder "Custom item name").
    await page.getByTestId("line-item-name-0").fill("Consulting");
    await page.getByTestId("line-item-rate-0").fill("1000");

    await page.getByRole("button", { name: /^save as draft$/i }).click();
    await expect(page).toHaveURL(/\/sales\/quotes\/[^/]+$/, { timeout: 30_000 });

    // 2. Mark quote as Sent -------------------------------------------------
    await page.getByTestId("mark-as-sent-button").click();
    // Status badge flips from DRAFT to SENT
    await expect(page.getByText(/^SENT$/).first()).toBeVisible({
      timeout: 15_000,
    });

    // 3. Convert quote → invoice -------------------------------------------
    await page.getByTestId("convert-to-invoice-button").click();
    await expect(page).toHaveURL(/\/sales\/invoices\/[^/]+$/, {
      timeout: 30_000,
    });

    // 4. Mark invoice as Sent (if it's currently DRAFT) ---------------------
    const invoiceMarkSent = page.getByTestId("mark-as-sent-button");
    if (await invoiceMarkSent.isVisible().catch(() => false)) {
      await invoiceMarkSent.click();
      await expect(page.getByText(/^SENT$/).first()).toBeVisible({
        timeout: 15_000,
      });
    }

    // 5. Record full payment -----------------------------------------------
    await page.getByTestId("record-payment-trigger").click();
    await expect(
      page.getByRole("heading", { name: /record payment/i })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("payment-amount-input").fill("1000");
    await page
      .getByRole("button", { name: /auto-allocate oldest first/i })
      .click();
    await page.getByTestId("record-payment-submit").click();

    // 6. Assert PAID --------------------------------------------------------
    await expect(page.getByText(/^PAID$/).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
