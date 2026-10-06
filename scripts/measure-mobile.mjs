import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const url = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173";
const macChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_EXECUTABLE_PATH ??
    (existsSync(macChrome) ? macChrome : undefined),
});
const profile = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  network: {
    latency_ms: 150,
    download_bits_per_second: 1_600_000,
    upload_bits_per_second: 750_000,
  },
  cpu_slowdown: 4,
  cache: "disabled; new browser context per run",
};
const report = {
  browser: browser.version(),
  platform: process.platform,
  profile,
  target_ms: 5000,
  start: "navigationStart",
  end: "Index, place lookup, accessible list, and all viewport geometry loaded; two animation frames painted",
  basemap: "disabled: external tiles are excluded and no OSM requests are made",
  source_hash: createHash("sha256")
    .update(await readFile("data/processed/hrm/income.geojson"))
    .digest("hex"),
  runs: [],
};
try {
  // Include a full-geometry baseline, then three independent chunked cold-cache runs.
  for (const mode of ["all", "chunked", "chunked", "chunked"]) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      deviceScaleFactor: profile.deviceScaleFactor,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
    });
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send("Network.enable");
    await session.send("Network.setCacheDisabled", { cacheDisabled: true });
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: profile.network.latency_ms,
      downloadThroughput: profile.network.download_bits_per_second / 8,
      uploadThroughput: profile.network.upload_bits_per_second / 8,
    });
    await session.send("Emulation.setCPUThrottlingRate", {
      rate: profile.cpu_slowdown,
    });
    await page.goto(
      `${url}/?basemap=off${mode === "all" ? "&geometry=all" : ""}`,
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForSelector('body[data-usability-ready="true"]', {
      timeout: 90_000,
    });
    const result = await page.evaluate(() => ({
      usable_ms: performance.getEntriesByName("income-map-usable")[0].startTime,
      index_ready_ms:
        performance.getEntriesByName("income-index-ready")[0].startTime,
      resources: performance.getEntriesByType("resource").map((entry) => {
        const r = entry;
        return {
          name: r.name.split("/").pop(),
          bytes: r.transferSize,
          duration_ms: r.duration,
        };
      }),
    }));
    // Readiness is followed by a genuine selection, not only a stopwatch marker.
    const selectionStart = Date.now();
    await page
      .getByRole("searchbox", { name: "Filter census areas by identifier" })
      .fill("12090312");
    await page
      .getByRole("button", {
        name: "Census area 12090312, $50,800",
        exact: true,
      })
      .tap();
    await page.getByRole("heading", { name: "Census area 12090312" }).waitFor();
    const selectedValue = await page
      .locator("#details .income-value")
      .textContent();
    if (selectedValue !== "$50,800")
      throw new Error("Selected income differs from source.");
    const run = {
      mode,
      ...result,
      passes_target: result.usable_ms <= report.target_ms,
      selection_ms: Date.now() - selectionStart,
      selected_area: "12090312",
      selected_income: selectedValue,
    };
    report.runs.push(run);
    console.log(
      `${mode}: ${Math.round(run.usable_ms)} ms; selection ${run.selection_ms} ms`,
    );
    await context.close();
  }
  const values = report.runs
    .filter((r) => r.mode === "chunked")
    .map((r) => r.usable_ms)
    .sort((a, b) => a - b);
  report.chunked_median_ms = values[1];
  report.all_chunked_runs_pass = values.every((v) => v <= report.target_ms);
  await mkdir("reports", { recursive: true });
  await writeFile(
    "reports/mobile-performance.json",
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
