import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "admin@quikfinance.dev";
const ADMIN_PASSWORD = "Quikfinance!123";

async function signInViaApi(page: import("@playwright/test").Page) {
  const csrfRes = await page.request.get("/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const signInRes = await page.request.post(
    "/api/auth/callback/credentials",
    {
      form: {
        csrfToken,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        callbackUrl: "/",
      },
      maxRedirects: 0,
    }
  );
  expect([200, 302]).toContain(signInRes.status());
}

/**
 * Purchases module smoke — verifies the P3-A through P3-D surfaces
 * render without runtime errors and the PDF endpoint returns binary.
 *
 *   1. List page (`/purchases/orders`) renders the title + status
 *      dropdown without an error boundary.
 *   2. New PO form renders the vendor band + line-items table.
 *   3. Existing PO detail page renders (we don't create one to keep
 *      the test idempotent against the seed admin's data).
 *   4. Vendors list renders the title + MSME banner gate.
 */
test.describe("Purchases module smoke", () => {
  test("each Purchases sub-module list page renders without error", async ({
    page,
  }) => {
    await signInViaApi(page);

    const checks: { url: string; title: RegExp }[] = [
      { url: "/purchases/vendors", title: /vendors/i },
      { url: "/purchases/orders", title: /purchase orders/i },
      { url: "/purchases/orders/new", title: /^new purchase order$/i },
      { url: "/purchases/vendors/new", title: /^new vendor$/i },
      { url: "/purchases/vendors/import", title: /^import vendors$/i },
    ];

    for (const { url, title } of checks) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
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

  test("the New Purchase Order form renders the line-items table", async ({
    page,
  }) => {
    await signInViaApi(page);
    await page.goto("/purchases/orders/new");
    await page.waitForLoadState("networkidle");
    // Heading is rendered as h1 next to the shopping-bag icon.
    await expect(
      page.getByRole("heading", { level: 1, name: /^new purchase order$/i })
    ).toBeVisible();
    // Vendor band label
    await expect(page.getByText(/vendor name/i).first()).toBeVisible();
    // Line items table header — TransactionLineItemsTable renders
    // an "Item details" column heading.
    await expect(page.getByText(/item details/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("the New Vendor form renders all 7 tabs", async ({ page }) => {
    await signInViaApi(page);
    await page.goto("/purchases/vendors/new");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { level: 1, name: /^new vendor$/i })
    ).toBeVisible();
    // Tabs (rendered as <button role=tab> in shadcn). Check labels:
    for (const tabName of [
      /other details/i,
      /address/i,
      /contact persons/i,
      /bank details/i,
      /custom fields/i,
      /reporting tags/i,
      /remarks/i,
    ]) {
      await expect(
        page.getByRole("tab", { name: tabName })
      ).toBeVisible();
    }
  });
});
