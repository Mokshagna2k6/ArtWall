import { defineConfig, devices } from "@playwright/test";

/**
 * E2E (`pnpm test:e2e`). Runs against E2E_BASE_URL when set, otherwise starts
 * the app on port 3217: `next start` (after `pnpm build`) in CI, `next dev`
 * locally.
 *
 * Needs a real database and Razorpay TEST keys in the environment: the booking
 * spec pays through real Razorpay Checkout in test mode.
 */
const port = Number(process.env.E2E_PORT ?? 3217);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: process.env.CI ? `pnpm start -p ${port}` : `pnpm dev -p ${port}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
        env: { BETTER_AUTH_URL: baseURL, PHYSICAL_WALL_ENABLED: "true" },
      },
});
