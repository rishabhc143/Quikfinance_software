import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "admin@quikfinance.dev";
const ADMIN_PASSWORD = "Quikfinance!123";

async function signInViaApi(page: import("@playwright/test").Page) {
  const csrfRes = await page.request.get("/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const signInRes = await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      callbackUrl: "/",
    },
    maxRedirects: 0,
  });
  expect([200, 302]).toContain(signInRes.status());
}

/**
 * Sales module lifecycle smoke. Asserts that every sub-module's list page
 * renders its h1 page title. Each heading query is constrained to level 1
 * so the empty-state h2 ("No credit notes yet.", "No payments yet.", etc.)
 * doesn't trip strict-mode on partial regex matches.
 *
 * The deeper "create customer → quote → convert → record payment" lifecycle
 * test is a follow-up that needs isolated test-data seeding so it doesn't
 * race the seed admin's data.
 */
test.describe("Sales module lifecycle smoke", () => {
  test("each Sales sub-module list page renders", async ({ page }) => {
    await signInViaApi(page);

    const checks: { url: string; heading: RegExp }[] = [
      { url: "/sales/customers", heading: /^all customers$/i },
      { url: "/sales/quotes", heading: /^all quotes$/i },
      { url: "/sales/orders", heading: /^all sales orders$/i },
      { url: "/sales/invoices", heading: /^all invoices$/i },
      { url: "/sales/recurring-invoices", heading: /^recurring invoices$/i },
      { url: "/sales/credit-notes", heading: /^credit notes$/i },
      { url: "/sales/delivery-challans", heading: /^delivery challans$/i },
      { url: "/sales/payments-received", heading: /^payments received$/i },
    ];

    for (const { url, heading } of checks) {
      await page.goto(url);
      await expect(
        page.getByRole("heading", { level: 1, name: heading })
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test("the New Customer form renders all expected sections", async ({ page }) => {
    await signInViaApi(page);
    await page.goto("/sales/customers/new");
    await expect(page.getByRole("heading", { level: 1, name: /^new customer$/i })).toBeVisible();
    // The 6 tabs should all be visible
    for (const tabName of [
      /other details/i,
      /address/i,
      /contact persons/i,
      /custom fields/i,
      /reporting tags/i,
      /remarks/i,
    ]) {
      await expect(page.getByRole("tab", { name: tabName })).toBeVisible();
    }
    // Save button is present
    await expect(page.getByRole("button", { name: /^save$/i })).toBeVisible();
  });
});
