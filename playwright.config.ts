import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.APP_URL || "http://localhost:3000";
const port = new URL(baseURL).port || "3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  // All specs share one seeded database and some pause suppliers while they run: run them one at a time
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    viewport: { width: 360, height: 740 },
    // Fail fast when a control is covered or missing instead of waiting for the test timeout
    actionTimeout: 15000,
    trace: "on-first-retry",
  },
  // Serves the production build; run `pnpm build` first. Locally an already
  // running server on APP_URL is reused.
  webServer: {
    command: `pnpm start --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: "Mobile Chrome 360x740",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 360, height: 740 },
      },
    },
  ],
});
