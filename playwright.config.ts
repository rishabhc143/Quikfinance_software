import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: isCI ? [["github"], ["list"]] : "list",
  retries: isCI ? 1 : 0,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // Auto-start the app server when running tests. In dev, reuse the dev server
  // if it's already running (typical local workflow). In CI, build then start
  // the production server for fidelity.
  webServer: {
    command: isCI ? "pnpm next start" : "pnpm next dev",
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
