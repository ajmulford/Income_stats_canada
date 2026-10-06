import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const macChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: {
          executablePath:
            process.env.CHROME_EXECUTABLE_PATH ??
            (existsSync(macChrome) ? macChrome : undefined),
        },
      },
    },
    ...(process.env.CROSS_BROWSER === "1"
      ? [
          { name: "firefox", use: { browserName: "firefox" as const } },
          { name: "webkit", use: { browserName: "webkit" as const } },
        ]
      : []),
  ],
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
