import { defineConfig } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
// Reuse the installed browser on Windows; CI installs the pinned Playwright browser.
const browsers = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : "";
const installed =
  browsers && existsSync(browsers)
    ? readdirSync(browsers)
        .filter(name => /^chromium-\d+$/.test(name))
        .sort()
        .reverse()
        .map(name => join(browsers, name, "chrome-win64", "chrome.exe"))
        .find(existsSync)
    : undefined;
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: [["list"], ["json", { outputFile: "test-results/browser-results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: "off",
    screenshot: "off",
    video: "off",
    launchOptions: {
      executablePath: process.env.SPOTIBUDS_BROWSER_EXECUTABLE || installed,
      args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    },
  },
});
