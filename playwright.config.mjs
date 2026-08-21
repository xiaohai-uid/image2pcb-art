import { defineConfig } from "@playwright/test";

const pythonCommand = process.platform === "win32" ? "python" : "python3";

export default defineConfig({
  testDir: "./test",
  testMatch: "**/*.browser.spec.mjs",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4178",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 720 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `${pythonCommand} -m http.server 4178`,
    url: "http://127.0.0.1:4178",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
