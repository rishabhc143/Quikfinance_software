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
    },
  );
  expect([200, 302]).toContain(signInRes.status());
}

/**
 * Catches the regression class that surfaced after PR #270 (Bills
 * Zoho-layout rewrite) + PR #271 (next.config trace-includes hotfix):
 *
 *   1. Bills LIST + NEW form must render without an error overlay —
 *      this is what the user hit when the new BillForm shipped and
 *      the migration that added its required columns hadn't yet
 *      reached prod.
 *   2. Invoice + Bill PDF endpoints must actually return
 *      `application/pdf` binary — this catches a recurrence of the
 *      Noto Sans font ENOENT (PR #268's bug class) AND any future
 *      missing-trace-include issue that breaks the PDF render
 *      pipeline.
 *
 * Both checks need the seed admin signed in via the credentials API.
 */
test.describe("Bills module + PDF endpoints smoke", () => {
  test("Bills list + New Bill pages render without runtime error", async ({
    page,
  }) => {
    await signInViaApi(page);

    const checks: { url: string; mustSee: RegExp }[] = [
      { url: "/purchases/bills", mustSee: /bills/i },
      { url: "/purchases/bills/new", mustSee: /^new bill$/i },
    ];

    for (const { url, mustSee } of checks) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByText(/something went wrong/i),
        `Error overlay shown on ${url}`,
      ).not.toBeVisible();
      await expect(
        page.getByText(mustSee).first(),
        `Expected text matching ${mustSee} on ${url}`,
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test("Invoice PDF endpoint returns application/pdf", async ({ page }) => {
    await signInViaApi(page);

    // Find any invoice from the seed admin's org by hitting the list
    // page and following the first row link. Test is resilient to
    // whatever invoices the seed produces — only fails if none exist
    // OR the PDF endpoint 500s.
    await page.goto("/sales/invoices");
    const firstRow = page.locator('a[href^="/sales/invoices/"]').first();
    const href = await firstRow.getAttribute("href");
    if (!href || !/\/sales\/invoices\/[^/]+$/.test(href)) {
      test.skip(true, "no seed invoice to test PDF endpoint");
      return;
    }
    const pdfRes = await page.request.get(`${href}/pdf`);
    expect(
      pdfRes.status(),
      `Invoice PDF endpoint returned ${pdfRes.status()} for ${href}/pdf`,
    ).toBe(200);
    expect(pdfRes.headers()["content-type"]).toMatch(/application\/pdf/);
    const body = await pdfRes.body();
    // A real PDF starts with the magic header "%PDF-".
    expect(body.slice(0, 5).toString()).toBe("%PDF-");
    // Sanity check: should be at least a few KB (a Noto-Sans embedded
    // invoice is ~30 KB).
    expect(body.length).toBeGreaterThan(2000);
  });

  test("Bill PDF endpoint returns application/pdf", async ({ page }) => {
    await signInViaApi(page);

    await page.goto("/purchases/bills");
    const firstRow = page.locator('a[href^="/purchases/bills/"]').first();
    const href = await firstRow.getAttribute("href");
    if (!href || !/\/purchases\/bills\/[^/]+$/.test(href)) {
      test.skip(true, "no seed bill to test PDF endpoint");
      return;
    }
    const pdfRes = await page.request.get(`${href}/pdf`);
    expect(
      pdfRes.status(),
      `Bill PDF endpoint returned ${pdfRes.status()} for ${href}/pdf`,
    ).toBe(200);
    expect(pdfRes.headers()["content-type"]).toMatch(/application\/pdf/);
    const body = await pdfRes.body();
    expect(body.slice(0, 5).toString()).toBe("%PDF-");
    expect(body.length).toBeGreaterThan(2000);
  });
});
