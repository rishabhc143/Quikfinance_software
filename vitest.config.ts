import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config for unit tests.
 *
 * Scoped to `tests/unit/**` only — Playwright e2e tests stay in
 * `tests/e2e/` and are run via `pnpm test:e2e`. The `@/...` path
 * alias mirrors the one in tsconfig.json so test files can import
 * from the same module paths as production code.
 */
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    environment: "node",
    globals: false,
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
