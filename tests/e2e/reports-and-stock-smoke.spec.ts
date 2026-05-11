import { test, expect } from "@playwright/test";

/**
 * Smoke test for the inventory + reports pages shipped in PRs #66–#79.
 *
 * These are server-rendered pages with non-trivial joins (stock
 * levels join InventoryAdjustment + InventoryReservation; valuation
 * joins those with cost prices; GSTR-1 export reads invoices in a
 * period). A regression in any of these is silent today — the
 * existing sales-lifecycle.spec covers the Sales sub-pages but not
 * these. This catches the obvious "page crashes" class of bug.
 *
 * Auth uses the same seed-admin credentials as the rest of the e2e
 * suite. No fixtures needed — we only assert the pages render their
 * title and have no "Something went wrong" overlay.
 */

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

test.describe("Inventory + Reports smoke", () => {
  test("each new page renders without an error overlay", async ({ page }) => {
    await signInViaApi(page);

    const checks: { url: string; title: RegExp }[] = [
      { url: "/items/stock", title: /^stock levels$/i },
      { url: "/reports/stock-valuation", title: /^stock valuation$/i },
      { url: "/reports/gstr1", title: /^gstr-1 export$/i },
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
});
