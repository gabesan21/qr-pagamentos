import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: process.env.ADMIN_EVIDENCE_BASE_URL ?? "http://127.0.0.1:4319",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.ADMIN_EVIDENCE_BASE_URL ? undefined : {
    command: "pnpm start --hostname 127.0.0.1 --port 4319",
    url: "http://127.0.0.1:4319/design-system",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
