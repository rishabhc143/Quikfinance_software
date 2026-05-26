import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "admin@quikfinance.dev";
const ADMIN_PASSWORD = "Quikfinance!123";

async function signInViaApi(page: import("@playwright/test").Page) {
  // Use the same NextAuth API flow that the curl-based smoke tests use.
  // Avoids racing against React hydration in production builds.
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
  // 302 means success — NextAuth issues the session cookie and redirects.
  expect([200, 302]).toContain(signInRes.status());
}

test.describe("Auth + dashboard smoke", () => {
  test("unauthenticated user is redirected to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("login page renders all expected fields", async ({ page }) => {
    await page.goto("/login");
    // Magic-link is the primary CTA: email field + "Send link" button.
    await expect(page.getByLabel(/sign in with email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /send link/i })).toBeVisible();
    // Google OAuth is always surfaced when AUTH_GOOGLE_* env is set
    // (which it is in CI). Microsoft / GitHub buttons are env-gated.
    await expect(
      page.getByRole("button", { name: /continue with google/i }),
    ).toBeVisible();
    // Password fallback is collapsible — toggle to expose the inputs.
    await page.getByRole("button", { name: /use a password instead/i }).click();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in$/i })).toBeVisible();
  });

  test("seed admin can sign in and reach the dashboard, items list, and create a contact end-to-end", async ({ page }) => {
    await signInViaApi(page);

    // Dashboard
    await page.goto("/");
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

    // Create a new contact via the UI — first non-radio/email/checkbox input is Display Name
    await page.goto("/contacts/new");
    const displayName = `E2E Customer ${Date.now()}`;
    await page.locator('input:not([type="radio"]):not([type="email"]):not([type="checkbox"])').first().fill(displayName);
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page).toHaveURL(/\/contacts\/[^/]+$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(displayName);
  });
});
