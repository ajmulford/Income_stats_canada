import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rm,
  unlink,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
const script = resolve("scripts/release-tools.mjs");
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "income-release-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp("dist", join(dir, "dist"), { recursive: true });
  await mkdir(join(dir, "data"));
  await mkdir(join(dir, "release"));
  await mkdir(join(dir, "reports"));
  for (const name of ["reviewed-release.json", "income-bands.json"])
    await cp(`data/${name}`, join(dir, "data", name));
  const candidate = JSON.parse(await readFile("dist/release.json", "utf8"));
  const evidence = {
    candidate_sha256: candidate.candidate_sha256,
    checks: ["physical_phone", "screen_reader"].map((name) => ({
      name,
      status: "passed",
      environment: "isolated test fixture",
      tester: "test fixture",
      tested_at: "2026-10-06T12:00:00Z",
      notes: "Fabricated only within this temporary test directory.",
    })),
  };
  const performance = {
    candidate_sha256: candidate.candidate_sha256,
    source_hash: candidate.source_sha256,
    runs: [1, 2, 3].map(() => ({ mode: "chunked", usable_ms: 3000 })),
  };
  await writeFile(
    join(dir, "release/verification.json"),
    JSON.stringify(evidence),
  );
  await writeFile(
    join(dir, "reports/mobile-performance-milestone-four.json"),
    JSON.stringify(performance),
  );
  return { dir, evidence, performance };
}
const run = (dir) =>
  spawnSync(process.execPath, [script, "check"], {
    cwd: dir,
    encoding: "utf8",
  });
test("an exact candidate with complete evidence passes", async (t) => {
  const { dir } = await fixture(t);
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
});
test("a missing geometry file blocks release", async (t) => {
  const { dir } = await fixture(t);
  await unlink(join(dir, "dist/data/hrm/areas-00.json.gz"));
  const r = run(dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Missing or changed browser artifact/);
});
test("a changed CSV blocks release", async (t) => {
  const { dir } = await fixture(t);
  await writeFile(join(dir, "dist/data/hrm/income.csv"), "changed");
  const r = run(dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Missing or changed browser artifact/);
});
test("manual checks cannot approve a different candidate", async (t) => {
  const { dir, evidence } = await fixture(t);
  evidence.candidate_sha256 = "stale";
  await writeFile(
    join(dir, "release/verification.json"),
    JSON.stringify(evidence),
  );
  const r = run(dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /exact candidate/);
});
test("a pending screen-reader check blocks release", async (t) => {
  const { dir, evidence } = await fixture(t);
  evidence.checks[1].status = "pending";
  await writeFile(
    join(dir, "release/verification.json"),
    JSON.stringify(evidence),
  );
  const r = run(dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /screen_reader/);
});
test("stale mobile evidence blocks release", async (t) => {
  const { dir, performance } = await fixture(t);
  performance.candidate_sha256 = "stale";
  await writeFile(
    join(dir, "reports/mobile-performance-milestone-four.json"),
    JSON.stringify(performance),
  );
  const r = run(dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /mobile performance/);
});

// Exercise the real publication transformation, including the reviewed footer.
test("publication stamps the reviewed preview without changing candidate identity", async (t) => {
  const { dir, evidence } = await fixture(t);
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  assert.equal(git("init").status, 0);
  assert.equal(git("-c", "user.name=Release test", "-c", "user.email=release-test@example.invalid", "commit", "--allow-empty", "-m", "fixture").status, 0);
  const r = spawnSync(process.execPath, [script, "audit"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, RELEASE_DATE: "2026-10-06" },
  });
  assert.equal(r.status, 0, r.stderr);
  const html = await readFile(join(dir, "dist/index.html"), "utf8");
  assert.match(html, /id="publication-status">Published/);
  assert.match(html, /id="release-status">Released 2026-10-06/);
  assert.doesNotMatch(html, /not yet\s*published/);
  const published = JSON.parse(await readFile(join(dir, "dist/release.json"), "utf8"));
  assert.equal(published.candidate_sha256, evidence.candidate_sha256);
  assert.notEqual(published.content_sha256, evidence.candidate_sha256);
  assert.equal(published.release_date, "2026-10-06");
});
