import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4173);
// 로컬에 설치된 크롬을 쓰고 싶으면 CHROME_PATH 지정(CI 는 playwright 가 설치한 chromium 사용)
const executablePath = process.env.CHROME_PATH || undefined;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { executablePath } }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: "pnpm --filter @qp/web build && pnpm --filter @qp/server start",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      HOST: "127.0.0.1",
      WEB_DIST: `${process.cwd()}/apps/web/dist`,
      CORS_ORIGINS: `http://127.0.0.1:${PORT}`,
      COUNTDOWN_MS: "1500",
      RECONNECT_GRACE_MS: "3000",
      NODE_ENV: "development",
    },
  },
});
