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
    .getByRole("button", { name: "Census area 12090312, $50,800", exact: true })
    .click();
  await expect(page.locator("#details .income-value")).toHaveText("$50,800");
  await expect(
    page.getByRole("button", {
      name: "Census area 12090312, $50,800",
      exact: true,
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
    exact: true,
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
      exact: true,
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

test("loads raw gzip files when the host does not set Content-Encoding", async ({ page }) => {
  await page.route("**/data/hrm/**.json.gz", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, "public/");
    await route.fulfill({ body: await readFile(path), contentType: "application/octet-stream" });
  });
  await ready(page);
  await expect(page.locator("#area-list button")).toHaveCount(30);
});

test("uses plain JSON when streaming decompression is unavailable", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "DecompressionStream", { value: undefined }); });
  await ready(page);
  await expect(page.locator("#area-list button")).toHaveCount(30);
});
