import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "admin@quikfinance.dev";
const ADMIN_PASSWORD = "Quikfinance!123";

test.describe("Auth + dashboard smoke", () => {
  test("unauthenticated user is redirected to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("seed admin can sign in and reach the dashboard, items list, and create an item end-to-end", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in$/i }).click();

    // Dashboard — assert by content. The URL may briefly pass through
    // /api/auth/callback in production builds before settling at /.
    await expect(page.getByRole("heading", { name: /^hello,/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Total Receivables")).toBeVisible();

    // Items list (seeded Widget Pro must appear)
    await page.goto("/items");
    await expect(page.getByRole("heading", { name: /all items/i })).toBeVisible();
    await expect(page.getByText("Widget Pro").first()).toBeVisible();

    // Settings grid
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /^settings$/i })).toBeVisible();
    await expect(page.getByText("Profile").first()).toBeVisible();

    // Create a new contact via the UI — first text input is Display Name
    await page.goto("/contacts/new");
    const displayName = `E2E Customer ${Date.now()}`;
    // First non-radio input is Display Name (the form leads with name; radios precede in DOM but radios have type=radio)
    await page.locator('input:not([type="radio"]):not([type="email"]):not([type="checkbox"])').first().fill(displayName);
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page).toHaveURL(/\/contacts\/[^/]+$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(displayName);
  });
});
