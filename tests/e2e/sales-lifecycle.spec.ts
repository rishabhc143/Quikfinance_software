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
 * Sales module lifecycle smoke. For every sub-module's list page:
 *   1. Asserts the page does NOT show the Next.js "Something went wrong"
 *      error overlay (catches RSC boundary violations like the bulk-action
 *      wrapper bug — see hotfix `bulk-actions-server-boundary`).
 *   2. Asserts the page title text appears somewhere on the page. We use
 *      `getByText` rather than `getByRole("heading")` because pages with
 *      saved-views render the title inside a `<button>` (chevron dropdown
 *      trigger), not an `<h1>`.
 *
 * The deeper "create customer → quote → convert → record payment" lifecycle
 * test is a follow-up that needs isolated test-data seeding so it doesn't
 * race the seed admin's data.
 */
test.describe("Sales module lifecycle smoke", () => {
  test("each Sales sub-module list page renders without error", async ({ page }) => {
    await signInViaApi(page);

    const checks: { url: string; title: RegExp }[] = [
      { url: "/sales/customers", title: /^customers$/i },
      { url: "/sales/quotes", title: /^quotes$/i },
      { url: "/sales/orders", title: /^sales orders$/i },
      { url: "/sales/invoices", title: /^invoices$/i },
      { url: "/sales/recurring-invoices", title: /^recurring invoices$/i },
      { url: "/sales/credit-notes", title: /^credit notes$/i },
      { url: "/sales/delivery-challans", title: /^delivery challans$/i },
      { url: "/sales/payments-received", title: /^payments received$/i },
    ];

    for (const { url, title } of checks) {
      await page.goto(url);
      // Wait for SSR to settle.
      await page.waitForLoadState("networkidle");
      // Defensive: the Next.js error boundary in production renders this
      // text. If our fix regresses, we want the test to fail loudly here
      // rather than time-out on a missing heading 15 seconds later.
      await expect(
        page.getByText(/something went wrong/i),
        `Error overlay shown on ${url}`
      ).not.toBeVisible();
      await expect(
        page.getByText(title).first(),
        `Title "${title}" missing on ${url}`
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
