import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: "dgclips.spec.ts", fullyParallel: false, workers: 1,
  use: { baseURL: "http://127.0.0.1:3107", locale: "pt-BR", screenshot: "only-on-failure", trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: {
    command: "pnpm exec next dev --hostname 127.0.0.1 --port 3107",
    url: "http://127.0.0.1:3107", reuseExistingServer: !process.env.CI,
    env: { DGCLIPS_DEMO: "true", NEXT_PUBLIC_SELF_HOST: "true", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
