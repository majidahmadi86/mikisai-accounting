import { defineConfig, devices } from "@playwright/test";

/**
 * Browser regression tests against a running production build
 * (`npm run build && npm run start`). Run: `npm run test:e2e`.
 * Needs the founder credentials and the service role key in .env.local.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  // The QA specs write to one live business, so they must not run side by side.
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    ...devices["Pixel 5"],
    viewport: { width: 375, height: 812 },
    locale: "en-GB",
  },
  reporter: [["list"]],
});
