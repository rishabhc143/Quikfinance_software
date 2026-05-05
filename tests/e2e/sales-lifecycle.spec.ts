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
 * Sales module lifecycle smoke. Asserts that the full receivables loop
 * works end-to-end on the seeded org:
 *
 *   sign in
 *     → /sales/customers (list reachable)
 *     → /sales/quotes (list reachable, empty state visible if no quotes)
 *     → /sales/invoices (list reachable)
 *     → /sales/recurring-invoices (list reachable)
 *     → /sales/credit-notes (list reachable)
 *     → /sales/delivery-challans (list reachable)
 *     → /sales/payments-received (list reachable)
 *
 * Phase S8 keeps this lightweight (route reachability + rendered headings)
 * so CI stays fast; a deeper "create customer → create quote → convert →
 * record payment" integration test will land in a follow-up that seeds
 * isolated test data.
 */
test.describe("Sales module lifecycle smoke", () => {
  test("each Sales sub-module list page renders", async ({ page }) => {
    await signInViaApi(page);

    await page.goto("/sales/customers");
    await expect(page.getByRole("heading", { name: /all customers/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/sales/quotes");
    await expect(page.getByRole("heading", { name: /all quotes/i })).toBeVisible();

    await page.goto("/sales/orders");
    await expect(page.getByRole("heading", { name: /all sales orders/i })).toBeVisible();

    await page.goto("/sales/invoices");
    await expect(page.getByRole("heading", { name: /all invoices/i })).toBeVisible();

    await page.goto("/sales/recurring-invoices");
    await expect(
      page.getByRole("heading", { name: /recurring invoices/i })
    ).toBeVisible();

    await page.goto("/sales/credit-notes");
    await expect(page.getByRole("heading", { name: /credit notes/i })).toBeVisible();

    await page.goto("/sales/delivery-challans");
    await expect(
      page.getByRole("heading", { name: /delivery challans/i })
    ).toBeVisible();

    await page.goto("/sales/payments-received");
    await expect(
      page.getByRole("heading", { name: /payments received/i })
    ).toBeVisible();
  });

  test("create customer via /sales/customers/new and reach the detail page", async ({
    page,
  }) => {
    await signInViaApi(page);
    await page.goto("/sales/customers/new");
    await expect(page.getByRole("heading", { name: /new customer/i })).toBeVisible();

    // Fill display name (required) — find the Display Name combobox button
    // and type into it. The combobox creates the value via "Add" item.
    const displayName = `E2E Sales ${Date.now()}`;
    await page.getByPlaceholder(/first name/i).fill("E2E");
    await page.getByPlaceholder(/last name/i).fill("Sales");
    // Open the Display Name combobox
    await page
      .getByRole("combobox", { name: /customer display name/i })
      .click()
      .catch(async () => {
        // fallback: click the placeholder
        await page.getByText("Customer display name").click();
      });
    await page.keyboard.type(displayName);
    // The combobox shows an "Add" entry — click it
    await page.getByText(`Add "${displayName}"`).click();

    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page).toHaveURL(/\/sales\/customers\/[^/]+$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(displayName);
  });
});
