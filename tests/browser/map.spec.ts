import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  // Prevent automated tests from contacting the community-funded OSM tile service.
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
});
async function ready(
  page: import("@playwright/test").Page,
  url = "/?basemap=off",
) {
  await page.goto(url);
  await expect(page.locator("body")).toHaveAttribute(
    "data-usability-ready",
    "true",
  );
}

test("census areas show all verified contained place names and explain missing matches", async ({ page }) => {
  const places = JSON.parse(await readFile("data/processed/hrm/places.json", "utf8")) as {
    name: string; containing_da_uids: string[];
  }[];
  const namesByArea = new Map<string, Set<string>>();
  for (const place of places) {
    if (place.containing_da_uids.length !== 1) continue;
    const id = place.containing_da_uids[0];
    const names = namesByArea.get(id) ?? new Set<string>();
    names.add(place.name);
    namesByArea.set(id, names);
  }
  const [id, names] = [...namesByArea].find(([, names]) => names.size > 1)!;
  await ready(page);
  await page.locator("#area-filter").fill(id);
  const row = page.locator(`#area-list button[data-area-id="${id}"]`);
  const label = `Near or part of: ${[...names].sort((a, b) => a.localeCompare(b, "en-CA")).join(", ")}`;
  await expect(row.locator(".area-place")).toHaveText(label);
  await expect(row).toHaveAccessibleName(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await row.click();
  await expect(page.locator("#details .area-location")).toHaveText(label);
  await expect(page.locator("#details")).toContainText("They do not define its boundary");
  await page.locator("#area-filter").fill("");
  const ids = await page.locator("#area-list button").evaluateAll(buttons => buttons.map(button => (button as HTMLElement).dataset.areaId!));
  const unnamed = ids.find(id => !namesByArea.has(id))!;
  const unnamedRow = page.locator(`#area-list button[data-area-id="${unnamed}"]`);
  await expect(unnamedRow.locator(".area-place")).toContainText("Near or part of: ");
  await unnamedRow.click();
  await expect(page.locator("#details .area-location")).toContainText("Near or part of: ");
  await expect(page.locator("#details")).toContainText("No named place location is linked within this area.");
  await expect(page.locator("#details")).toContainText("The label does not establish community membership");
});

test("nearby labels cover unmatched areas without overriding verified place matches", async ({ page }) => {
  await ready(page);
  const index = await (await page.request.get("/data/hrm/index.json")).json();
  const namedAreas = new Set(index.places.filter((p: {areas: string[]}) => p.areas.length === 1).flatMap((p: {areas: string[]}) => p.areas));
  for (const row of index.rows) {
    if (namedAreas.has(row.id)) {
      expect(row.nearbyPlace).toBeUndefined();
    } else {
      expect(index.places.some((p: {id: string; name: string}) => p.id === row.nearbyPlace.id && p.name === row.nearbyPlace.name)).toBe(true);
      expect(row.nearbyPlace.distanceKm).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(row.nearbyPlace.distanceKm)).toBe(true);
    }
  }
  const row = index.rows.find((r: {nearbyPlace?: unknown}) => r.nearbyPlace);
  await page.locator("#area-filter").fill(row.id);
  const button = page.locator(`#area-list button[data-area-id="${row.id}"]`);
  const label = `Near or part of: ${row.nearbyPlace.name}`;
  await expect(button.locator(".area-place")).toHaveText(label);
  await expect(button.locator(".area-place")).not.toContainText("km");
  await button.click();
  await expect(page.locator("#details .area-location")).toHaveText(label);
});

test("map click reveals desktop details when the right column is scrolled", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await ready(page);
  await page.locator("#area-list button").last().scrollIntoViewIfNeeded();
  expect(await page.locator("#selection-panel").evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThan(0);
  const point = { lat: 44.645462989342825, lon: -63.59112404336591 };
  const box = (await page.locator("#map").boundingBox())!;
  const scale = 256 * 2 ** 13;
  const y = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2;
  await page.mouse.click(
    box.x + box.width / 2 + (point.lon + 63.589) / 360 * scale,
    box.y + box.height / 2 + (y(point.lat) - y(44.664)) * scale,
  );
  await expect(page.locator("#details-title")).toHaveText("Census area 12090312");
  await expect.poll(async () => {
    const heading = (await page.locator("#details-title").boundingBox())!;
    const income = (await page.locator("#details .income-value").boundingBox())!;
    return heading.y >= 0 && income.y + income.height <= 900;
  }).toBe(true);
  await expect(page.locator("#details-title")).toBeFocused();
});

test("real map click and accessible list select the same published area", async ({
  page,
}) => {
  await ready(page);
  await expect(
    page.getByRole("heading", { name: "Income, across Halifax." }),
  ).toBeVisible();
  // A representative interior point of source DA 12090312; project independently of the app.
  const point = { lat: 44.645462989342825, lon: -63.59112404336591 };
  await page.locator("#map").scrollIntoViewIfNeeded();
  const box = (await page.locator("#map").boundingBox())!;
  const scale = 256 * 2 ** 13;
  const mercatorY = (lat: number) =>
    (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
  await page.mouse.click(
    box.x + box.width / 2 + ((point.lon + 63.589) / 360) * scale,
    box.y + box.height / 2 + (mercatorY(point.lat) - mercatorY(44.664)) * scale,
  );
  await expect(
    page.getByRole("heading", { name: "Census area 12090312" }),
  ).toBeVisible();
  await expect(page.locator("#details .income-value")).toHaveText("$50,800");
  await page
    .getByRole("searchbox", { name: "Filter census areas by identifier" })
    .fill("12090312");
  await page
    .getByRole("button", { name: "Census area 12090312, $50,800" })
    .click();
  await expect(page.locator("#details .income-value")).toHaveText("$50,800");
  await expect(
    page.getByRole("button", {
      name: "Census area 12090312, $50,800",
    }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("suppressed income remains unavailable and keyboard selection keeps focus", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("searchbox", { name: "Filter census areas by identifier" })
    .fill("12090104");
  const button = page.getByRole("button", {
    name: "Census area 12090104, Income unavailable",
  });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Census area 12090104" }),
  ).toBeVisible();
  await expect(page.locator("#details .income-value")).toHaveText(
    "Income unavailable",
  );
  await expect(page.locator("#details")).toContainText("confidentiality");
  await expect(button).toBeFocused();
  await expect(
    page.getByRole("link", { name: "View the official source" }),
  ).toHaveAttribute("href", /2021S051212090104/);
});

test("place lookup exposes ambiguous results and never assigns income to an uncontained point", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("searchbox", { name: "Community or place name" })
    .fill("Bedford");
  await expect(page.locator("#place-results button")).toHaveCount(2);
  await expect(page.locator("#place-status")).toContainText(
    "Choose a location",
  );
  await page.locator("#place-results button").first().click();
  await expect(page.locator("#place-status")).toContainText(
    "does not represent the entire community",
  );
  await page
    .getByRole("searchbox", { name: "Community or place name" })
    .fill("Terence Bay");
  await page.locator('button[data-place-id="036400"]').click();
  await expect(
    page.getByRole("heading", { name: "No containing census area" }),
  ).toBeVisible();
  await expect(page.locator("#place-status")).toContainText(
    "No income has been assigned",
  );
  await expect(page.locator("#area-list button")).toHaveCount(30);
});

test("CSV download is byte-for-byte the validated export", async ({ page }) => {
  await ready(page);
  const event = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download income CSV" }).click();
  const download = await event;
  const bytes = await readFile((await download.path())!);
  const source = await readFile("data/processed/hrm/income.csv");
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    createHash("sha256").update(source).digest("hex"),
  );
});

test("failed street tiles leave income, place lookup, and downloads usable", async ({
  page,
}) => {
  await ready(page, "/");
  await expect(page.locator("#basemap-status")).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Filter census areas by identifier" })
    .fill("12090985");
  await page
    .getByRole("button", { name: "Census area 12090985, $98,000" })
    .click();
  await expect(page.locator("#details .income-value")).toHaveText("$98,000");
  await expect(
    page.getByRole("searchbox", { name: "Community or place name" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("link", { name: "Download income CSV" }),
  ).toHaveAttribute("href", /income.csv/);
});

test("failed geometry can be retried without losing the income list", async ({
  page,
}) => {
  let failed = false;
  await page.route("**/areas-*.json.gz", (route) => {
    if (!failed) {
      failed = true;
      return route.fulfill({ status: 503, body: "Unavailable" });
    }
    return route.continue();
  });
  await page.goto("/?basemap=off");
  await expect(
    page.getByRole("button", { name: "Retry census areas" }),
  ).toBeVisible();
  await expect(page.locator("#area-list button")).toHaveCount(30);
  await page.getByRole("button", { name: "Retry census areas" }).click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-usability-ready",
    "true",
  );
});

test("phone layout and core accessibility checks pass before and after selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  let audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page
    .getByRole("searchbox", { name: "Filter census areas by identifier" })
    .fill("12090104");
  await page
    .getByRole("button", {
      name: "Census area 12090104, Income unavailable",
    })
    .click();
  audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
});

test("full municipality and urban controls load their views without fabricated data", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Show all HRM" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-loaded-areas", "604");
  await expect(page.locator("body")).toHaveAttribute("data-map-state", "ready");
  await page.getByRole("button", { name: "Urban view", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-map-state", "ready");
  await page
    .getByRole("searchbox", { name: "Filter census areas by identifier" })
    .fill("not-an-area");
  await expect(page.locator("#list-status")).toHaveText(
    "No census areas match this number.",
  );
  await expect(page.locator("#area-list button")).toHaveCount(0);
});

test("loads raw gzip files when the host does not set Content-Encoding", async ({
  page,
}) => {
  await page.route("**/data/hrm/**.json.gz", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      /^\//,
      "public/",
    );
    await route.fulfill({
      body: await readFile(path),
      contentType: "application/octet-stream",
    });
  });
  await ready(page);
  await expect(page.locator("#area-list button")).toHaveCount(30);
});

test("uses plain JSON when streaming decompression is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "DecompressionStream", { value: undefined });
  });
  await ready(page);
  await expect(page.locator("#area-list button")).toHaveCount(30);
});

test("phone selection panel expands, collapses, reopens, and preserves list focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page
    .getByRole("searchbox", { name: "Filter census areas by identifier" })
    .fill("12090312");
  const area = page.getByRole("button", {
    name: "Census area 12090312, $50,800",
  });
  await area.focus();
  await page.keyboard.press("Enter");
  await expect(area).toBeFocused();
  await expect(page.locator("#selection-panel")).toHaveCSS("position", "fixed");
  await expect(
    page.getByRole("button", { name: "Collapse details" }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator("#details")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Expand details" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#details .income-value")).toHaveText("$50,800");
  await expect(page.locator("#details")).toBeVisible();
});

test("place search normalizes punctuation and gives directional duplicate labels", async ({
  page,
}) => {
  await ready(page);
  const search = page.getByRole("searchbox", {
    name: "Community or place name",
  });
  await search.fill("  BEDFORD  ");
  await expect(page.locator("#place-results button")).toHaveCount(2);
  await expect(page.locator("#place-results")).toContainText(
    "Eastern location",
  );
  await expect(page.locator("#place-results")).toContainText(
    "Western location",
  );
  await search.fill("head-of-jeddore");
  await expect(page.locator("#place-results button")).toHaveCount(2);
  await search.fill("no-such-neighbourhood");
  await expect(page.locator("#place-status")).toContainText(
    "some neighbourhood names are absent",
  );
});

test("approved bands keep exact thresholds and separate unavailable income", async ({
  page,
}) => {
  await ready(page);
  await expect(page.locator("#band-status")).toHaveText("Fixed dollar bands");
  await expect(page.locator("#legend-bands li")).toHaveCount(8);
  const { bandIndex } = await import("../../src/data");
  const bands = JSON.parse(
    await readFile("data/income-bands.json", "utf8"),
  ).bands;
  expect(
    [
      39999, 40000, 59999, 60000, 79999, 80000, 99999, 100000, 119999, 120000,
      159999, 160000, 224000,
    ].map((v) => bandIndex(v, bands)),
  ).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
});

test("rural place search selects its own census income with street tiles blocked", async ({
  page,
}) => {
  await ready(page);
  const places = JSON.parse(
    await readFile("data/processed/hrm/places.json", "utf8"),
  );
  const income = JSON.parse(
    await readFile("data/processed/hrm/income.geojson", "utf8"),
  );
  const place = places.find(
    (p: { name: string }) => p.name === "Sheet Harbour",
  );
  const expected = income.features.find(
    (f: { properties: { da_uid: string } }) =>
      f.properties.da_uid === place.containing_da_uids[0],
  ).properties;
  await page
    .getByRole("searchbox", { name: "Community or place name" })
    .fill("Sheet Harbour");
  await expect(page.locator("#place-results button strong").first()).toHaveText(
    "Sheet Harbour",
  );
  await page
    .locator(`#place-results button[data-place-id="${place.place_id}"]`)
    .click();
  await expect(page.locator("#details-title")).toHaveText(
    `Census area ${expected.da_uid}`,
  );
  await expect(page.locator("#details .income-value")).toHaveText(
    new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 0,
    }).format(expected.median_household_income_cad),
  );
  await expect(page.locator("#place-status")).toContainText(
    "does not represent the entire community",
  );
});

test("project-subdirectory hosting keeps assets, search, selection, and CSV within the project", async ({
  page,
}) => {
  await page.route("**/IncomeStatistics/**", async (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(/^\/IncomeStatistics\//, "/");
    await route.fulfill({
      response: await route.fetch({ url: url.toString() }),
    });
  });
  await ready(page, "/IncomeStatistics/?basemap=off");
  await expect(page.locator("#download-csv")).toHaveAttribute(
    "href",
    "./data/hrm/income.csv",
  );
  await page
    .getByRole("searchbox", { name: "Filter census areas by identifier" })
    .fill("12090312");
  await page
    .getByRole("button", { name: "Census area 12090312, $50,800" })
    .click();
  await expect(page.locator("#details .income-value")).toHaveText("$50,800");
  const resolved = await page
    .locator("#download-csv")
    .evaluate((a: HTMLAnchorElement) => a.href);
  expect(new URL(resolved).pathname).toBe(
    "/IncomeStatistics/data/hrm/income.csv",
  );
});


test("ordinary wheel scrolls the page while Ctrl + wheel zooms the map", async ({ page }) => {
  await ready(page);
  const map = page.locator("#map");
  const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
  await expect(page.locator(".map-scroll-hint")).toBeVisible();
  await map.hover();
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 250);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  await map.hover();
  await page.keyboard.down("Control");
  try {
    // Leaflet limits each wheel gesture to four levels; reach maximum zoom.
    await page.mouse.wheel(0, -10000);
    await page.waitForTimeout(150);
    await page.mouse.wheel(0, -10000);
    await expect(zoomIn).toHaveAttribute("aria-disabled", "true");
  } finally {
    await page.keyboard.up("Control");
  }
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 250);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBefore);
  await expect(zoomIn).toHaveAttribute("aria-disabled", "true");
  await map.hover();
  await page.keyboard.down("Control");
  try {
    await page.mouse.wheel(0, 200);
    await expect(zoomIn).toHaveAttribute("aria-disabled", "false");
  } finally {
    await page.keyboard.up("Control");
  }
});


for (const width of [390, 768, 1280, 1920]) {
  test(`HRM overview frames mainland areas at viewport width ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await ready(page);
    await page.getByRole("button", { name: "Show all HRM" }).click();
    await expect(page.locator("body")).toHaveAttribute("data-map-state", "ready");
    const indexResponse = await page.request.get("/data/hrm/index.json");
    const index = await indexResponse.json();
    expect(index.overviewBounds[2]).toBeLessThan(-62);
    expect(index.bounds[2]).toBeGreaterThan(-60);
    expect(index.rows).toHaveLength(604);
    expect(index.rows.some((r: {id: string}) => r.id === "12090845")).toBe(true);
    // At the full mainland overview, a representative urban point lies left of
    // centre. Project the independently calculated mainland fit into screen pixels.
    const box = (await page.locator("#map").boundingBox())!;
    const b = index.overviewBounds;
    const y = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2;
    const zoom = Math.floor(Math.min(
      Math.log2((box.width - 32) / ((b[2] - b[0]) / 360 * 256)),
      Math.log2((box.height - 32) / ((y(b[1]) - y(b[3])) * 256)),
    ));
    const scale = 256 * 2 ** Math.max(6, zoom);
    const point = {lat: 44.645462989342825, lon: -63.59112404336591};
    await page.locator("#map").scrollIntoViewIfNeeded();
    const visible = (await page.locator("#map").boundingBox())!;
    await page.mouse.click(
      visible.x + visible.width / 2 + (point.lon - (b[0] + b[2]) / 2) / 360 * scale,
      visible.y + visible.height / 2 + (y(point.lat) - (y(b[1]) + y(b[3])) / 2) * scale,
    );
    await expect(page.locator("#selection-panel")).toHaveClass(/has-selection/);
    await page.getByRole("button", { name: "Urban view", exact: true }).click();
    await expect(page.getByRole("button", { name: "Zoom out", exact: true })).toHaveAttribute("aria-disabled", "false");
    // The retained offshore area can still be selected and navigated to.
    await page.getByRole("searchbox", {name: "Filter census areas by identifier"}).fill("12090845");
    await page.getByRole("button", {name: /^Census area 12090845, Income unavailable/}).click();
    await expect(page.getByRole("heading", {name:"Census area 12090845"})).toBeVisible();
  });
}


test("income overlay toggles completely and opacity remains adjustable after navigation", async ({ page }) => {
  await ready(page);
  const toggle = page.getByRole("checkbox", {name: "Show income data"});
  const slider = page.getByRole("slider", {name: "Colour opacity"});
  const canvas = page.locator("#map canvas").first();
  const ink = () => canvas.evaluate((element) => {
    const c = element as HTMLCanvasElement;
    const data = c.getContext("2d")!.getImageData(0,0,c.width,c.height).data;
    return data.reduce((sum, value) => sum + value, 0);
  });
  await expect(toggle).toBeChecked();
  await expect(slider).toHaveValue("45");
  await expect.poll(ink).toBeGreaterThan(0);
  const original = await ink();
  await slider.focus();
  await page.keyboard.press("End");
  await expect(slider).toHaveValue("100");
  await expect(page.locator("#opacity-value")).toHaveText("100%");
  await expect.poll(ink).not.toBe(original);
  await toggle.uncheck();
  await expect(slider).toBeDisabled();
  await expect.poll(ink).toBe(0);
  await page.getByRole("button", {name:"Show all HRM"}).click();
  await expect(page.locator("body")).toHaveAttribute("data-map-state", "ready");
  await expect.poll(ink).toBe(0);
  await page.getByRole("searchbox", {name:"Filter census areas by identifier"}).fill("12090312");
  await page.getByRole("button", {name:"Census area 12090312, $50,800"}).click();
  await expect(page.locator("#details .income-value")).toHaveText("$50,800");
  await expect.poll(ink).toBe(0);
  await toggle.check();
  await expect(slider).toBeEnabled();
  await expect(slider).toHaveValue("100");
  await expect.poll(ink).toBeGreaterThan(0);
  await expect(page.locator("#details .income-value")).toHaveText("$50,800");
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveValue("0");
  await expect(page.locator("#opacity-value")).toHaveText("0%");
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(audit.violations).toEqual([]);
});


for (const viewport of [{width:390,height:844}, {width:360,height:640}, {width:740,height:390}]) {
 test(`phone list tap shows map and details at ${viewport.width}×${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await ready(page);
  await page.getByRole("searchbox", {name:"Filter census areas by identifier"}).fill("12090312");
  await page.getByRole("button", {name:"Census area 12090312, $50,800"}).click();
  await expect(page.locator("#details .income-value")).toHaveText("$50,800");
  await expect.poll(async () => {
    const map = (await page.locator("#map").boundingBox())!;
    const panel = (await page.locator("#selection-panel").boundingBox())!;
    return map.y >= 0 && map.y + map.height <= panel.y;
  }).toBe(true);
  await expect(page.locator("#map")).toBeFocused();
});
}

for (const viewport of [{width:1280,height:900}, {width:1440,height:720}]) {
  test(`desktop list click reveals details beside the map at ${viewport.width}`, async ({page}) => {
    await page.setViewportSize(viewport);
    await ready(page);
    await page.locator("#area-list button").last().click();
    await expect.poll(async () => {
      const details = (await page.locator("#details-title").boundingBox())!;
      const amount = (await page.locator("#details .income-value").boundingBox())!;
      const map = (await page.locator("#map").boundingBox())!;
      return details.y >= 0 && amount.y + amount.height <= viewport.height && map.y >= 0 && map.y < viewport.height;
    }).toBe(true);
    await expect(page.locator("#details-title")).toBeFocused();
  });
}


test("desktop details stay open after resizing from collapsed mobile details", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await ready(page);
  await page.getByRole("searchbox", {name:"Filter census areas by identifier"}).fill("12090312");
  await page.getByRole("button", {name:"Census area 12090312, $50,800"}).click();
  await page.getByRole("button", {name:"Collapse details"}).click();
  await expect(page.locator("#details")).toBeHidden();
  await page.setViewportSize({width:1280,height:900});
  await expect(page.locator("#toggle-details")).toBeHidden();
  await expect(page.locator("#details .income-value")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#details")).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole("button", {name:"Collapse details"})).toBeVisible();
});


test("census list sorts all pages and filtered results while keeping unknown incomes last", async ({page}) => {
  await ready(page);
  const index: {rows: {id: string; income: number | null}[]} = await (await page.request.get("/data/hrm/index.json")).json();
  const sort = page.getByRole("combobox", {name:"Sort census areas"});
  const ids = () => page.locator("#area-list button").evaluateAll(buttons => buttons.map(b => (b as HTMLElement).dataset.areaId));
  const byIncome = [...index.rows].sort((a,b) => {
    if (a.income === null) return b.income === null ? a.id.localeCompare(b.id) : 1;
    if (b.income === null) return -1;
    return b.income-a.income || a.id.localeCompare(b.id);
  });
  await sort.selectOption("income-desc");
  await expect.poll(ids).toEqual(byIncome.slice(0,30).map(r => r.id));
  await page.getByRole("button", {name:"Next",exact:true}).click();
  await expect.poll(ids).toEqual(byIncome.slice(30,60).map(r => r.id));
  await sort.selectOption("area-desc");
  await expect(page.locator("#page-number")).toHaveText("Page 1 of 21");
  await expect.poll(ids).toEqual([...index.rows].sort((a,b)=> b.id.localeCompare(a.id)).slice(0,30).map(r=>r.id));
  await page.getByRole("searchbox", {name:"Filter census areas by identifier"}).fill("120901");
  await sort.selectOption("income-asc");
  const filtered = index.rows.filter(r=>r.id.includes("120901")).sort((a,b)=> {
    if (a.income === null) return b.income === null ? a.id.localeCompare(b.id) : 1;
    if (b.income === null) return -1;
    return a.income-b.income || a.id.localeCompare(b.id);
  });
  await expect.poll(ids).toEqual(filtered.slice(0,30).map(r=>r.id));
  const selected = filtered.find(r=>r.income!==null)!;
  await page.locator(`#area-list button[data-area-id="${selected.id}"]`).click();
  await expect(page.getByRole("heading", {name:`Census area ${selected.id}`})).toBeVisible();
  await sort.selectOption("income-desc");
  await page.getByRole("searchbox", {name:"Filter census areas by identifier"}).fill(selected.id);
  await expect(page.locator(`#area-list button[data-area-id="${selected.id}"]`)).toHaveAttribute("aria-pressed","true");
  // Visit every page to verify the unavailable rows remain last globally.
  await page.getByRole("searchbox", {name:"Filter census areas by identifier"}).fill("");
  for (let pageNumber=1;pageNumber<21;pageNumber++) await page.getByRole("button",{name:"Next",exact:true}).click();
  await expect.poll(ids).toEqual(byIncome.slice(600).map(r=>r.id));
  await expect(page.locator("#area-list button").last()).toContainText("Income unavailable");
});


test("phone sort control stays reachable above expanded details", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await ready(page);
  await page.getByRole("searchbox", {name:"Filter census areas by identifier"}).fill("12090312");
  await page.getByRole("button", {name:"Census area 12090312, $50,800"}).click();
  const sort = page.getByRole("combobox", {name:"Sort census areas"});
  await sort.focus();
  await expect.poll(async () => {
    const control = (await sort.boundingBox())!;
    const panel = (await page.locator("#selection-panel").boundingBox())!;
    return control.y >= 0 && control.y + control.height < panel.y;
  }).toBe(true);
  await sort.selectOption("income-desc");
  await expect(sort).toBeFocused();
  await expect(page.locator("#details .income-value")).toHaveText("$50,800");
});


for (const viewport of [{width:1280,height:900}, {width:390,height:844}]) {
  test(`place suggestion reveals both map and details at ${viewport.width}`, async ({page}) => {
    await page.setViewportSize(viewport);
    await ready(page);
    await page.getByRole("searchbox", {name:"Community or place name"}).fill("Sheet Harbour");
    await page.locator("#place-results button").first().click();
    await expect(page.locator("#details .income-value")).toBeVisible();
    await expect.poll(async () => {
      const map = (await page.locator("#map").boundingBox())!;
      const details = (await page.locator("#details-title").boundingBox())!;
      const panel = (await page.locator("#selection-panel").boundingBox())!;
      return map.y >= 0 && map.y < viewport.height && details.y >= 0 && details.y < viewport.height
        && (viewport.width > 760 || map.y + map.height <= panel.y);
    }).toBe(true);
    await expect(page.locator(viewport.width > 760 ? "#details-title" : "#map")).toBeFocused();
    await page.getByRole("searchbox", {name:"Community or place name"}).fill("Terence Bay");
    await page.locator("#place-results button").filter({hasText:"Outside a single mapped census area"}).click();
    await expect(page.getByRole("heading", {name:"No containing census area"})).toBeVisible();
  });
}
