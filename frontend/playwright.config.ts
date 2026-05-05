import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright runs against a built Next.js server. The full
 * "submit URL -> see score" e2e covering api/worker is in a follow-up
 * PR (needs Mongo + Redis + worker container in CI). This config
 * focuses on what is testable from the frontend alone:
 * - landing, learn, dashboard render and pass axe
 * - keyboard / focus management
 * - error boundary on broken audit page
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_URL: "http://localhost:4000",
    },
  },
});
