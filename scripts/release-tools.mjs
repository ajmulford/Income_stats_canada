import { readFile, writeFile, readdir, lstat, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJSON = async (path) => JSON.parse(await readFile(path, "utf8"));
const reviewed = await readJSON("data/reviewed-release.json");
async function inventory(dir = "dist", prefix = "") {
  const files = {};
  for (const name of (await readdir(dir)).sort()) {
    const path = join(dir, name),
      key = prefix + name;
    const stat = await lstat(path);
    if (stat.isSymbolicLink())
      throw new Error(`Publication cannot contain symlinks: ${key}`);
    if (stat.isDirectory())
      Object.assign(files, await inventory(path, `${key}/`));
    else if (key !== "release.json") {
      if (
        !/^(index\.html|assets\/[^/]+|data\/hrm\/(?:index|all-areas|areas-\d+|artifacts)\.json(?:\.gz)?|data\/hrm\/income\.csv)$/.test(
          key,
        )
      )
        throw new Error(`Unexpected published file: ${key}`);
      const bytes = await readFile(path);
      files[key] = { bytes: bytes.length, sha256: hash(bytes) };
    }
  }
  return files;
}
function fingerprint(files) {
  return hash(JSON.stringify(files));
}
async function candidate() {
  const files = await inventory();
  const artifacts = await readJSON("dist/data/hrm/artifacts.json");
  if (artifacts.sourceHash !== reviewed.income_geojson_sha256)
    throw new Error("Browser artifact source differs from reviewed release.");
  for (const [name, expected] of Object.entries(artifacts.files)) {
    const delivered = files[`data/hrm/${name}`];
    if (
      !delivered ||
      delivered.sha256 !== expected.sha256 ||
      delivered.bytes !== expected.bytes
    )
      throw new Error(`Missing or changed browser artifact: ${name}`);
  }
  const index = await readJSON("dist/data/hrm/index.json");
  if (
    index.sourceHash !== reviewed.income_geojson_sha256 ||
    files["data/hrm/income.csv"]?.sha256 !== reviewed.income_csv_sha256
  )
    throw new Error("Built income release differs from reviewed data.");
  if (
    index.rows.length !== 604 ||
    index.rows.filter((r) => r.income === null).length !== 5
  )
    throw new Error("Unexpected HRM coverage or availability.");
  const bytes = Object.values(files).reduce((sum, f) => sum + f.bytes, 0);
  if (bytes >= 1_000_000_000)
    throw new Error("Site exceeds GitHub Pages size limit.");
  const sha256 = fingerprint(files);
  return { files, bytes, sha256, index };
}
async function check(c) {
  const evidence = await readJSON("release/verification.json");
  if (evidence.candidate_sha256 !== c.sha256)
    throw new Error(
      "Manual verification must name this exact candidate SHA-256. See reports/release-candidate.json.",
    );
  for (const name of ["physical_phone", "screen_reader"]) {
    const entry = evidence.checks.find((c) => c.name === name);
    if (
      !entry ||
      entry.status !== "passed" ||
      !entry.environment?.trim() ||
      !entry.tester?.trim() ||
      !entry.notes?.trim() ||
      !Number.isFinite(Date.parse(entry.tested_at))
    )
      throw new Error(`Required manual launch check is pending: ${name}`);
  }
  const mobile = await readJSON(
    "reports/mobile-performance-milestone-four.json",
  );
  if (
    mobile.candidate_sha256 !== c.sha256 ||
    mobile.source_hash !== reviewed.income_geojson_sha256 ||
    mobile.runs.filter((r) => r.mode === "chunked").length !== 3 ||
    !mobile.runs
      .filter((r) => r.mode === "chunked")
      .every((r) => r.usable_ms <= 5000)
  )
    throw new Error(
      "Current candidate needs three passing documented mobile performance runs.",
    );
}
const c = await candidate();
if (process.argv[2] === "check") {
  await check(c);
  console.log("Exact candidate passed manual and mobile publication gates.");
} else if (process.argv[2] === "audit") {
  const releaseDate = process.env.RELEASE_DATE || null;
  if (releaseDate) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate) ||
      new Date(releaseDate).toISOString().slice(0, 10) !== releaseDate
    )
      throw new Error("Invalid release date.");
    await check(c);
    const path = "dist/index.html";
    const html = await readFile(path, "utf8");
    // The reviewed preview footer predates the release-status span. Match its
    // existing text without changing the candidate that received launch checks.
    const footer = /Reviewed data snapshot: October 6, 2026\.\s*Preview — not yet\s*published\./g;
    const hasReleaseSpan = html.includes('id="release-status"');
    if (
      !html.includes('id="publication-status"') ||
      (!hasReleaseSpan && [...html.matchAll(footer)].length !== 1)
    )
      throw new Error("Missing release labels.");
    const releaseLabel = `Released ${releaseDate} · ${reviewed.release_id}`;
    const stamped = hasReleaseSpan
      ? html.replace(
          /(<span id="release-status">)[\s\S]*?(<\/span>)/,
          `$1${releaseLabel}$2`,
        )
      : html.replace(footer, `Reviewed data snapshot: October 6, 2026. <span id="release-status">${releaseLabel}</span>`);
    await writeFile(
      path,
      stamped.replace(
        /(<span id="publication-status">)[\s\S]*?(<\/span>)/,
        "$1Published$2",
      ),
    );
  }
  const files = await inventory();
  const report = {
    status: releaseDate ? "published_build" : "unpublished_candidate",
    release_id: reviewed.release_id,
    release_date: releaseDate,
    source_snapshot_date: reviewed.snapshot_date,
    income_reference_year: c.index.incomeYear,
    census_year: c.index.censusYear,
    source_sha256: reviewed.income_geojson_sha256,
    csv_sha256: reviewed.income_csv_sha256,
    bands_sha256: hash(await readFile("data/income-bands.json")),
    git_commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    working_tree_dirty: Boolean(execFileSync("git", ["status", "--porcelain", "--", "src", "index.html", "package.json", "package-lock.json", "vite.config.ts", "scripts", "data", "config"], { encoding: "utf8" }).trim()),
    candidate_sha256: c.sha256,
    content_sha256: fingerprint(files),
    site_bytes: Object.values(files).reduce((sum, f) => sum + f.bytes, 0),
    github_pages_site_limit_bytes: 1_000_000_000,
    files,
  };
  await mkdir("reports", { recursive: true });
  await writeFile(
    "reports/release-candidate.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await writeFile("dist/release.json", JSON.stringify(report, null, 2) + "\n");
  console.log(
    `${report.status}: ${report.site_bytes} bytes; candidate ${c.sha256}`,
  );
} else throw new Error("Use audit or check.");
