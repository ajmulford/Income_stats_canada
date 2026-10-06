import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const local = JSON.parse(await readFile("dist/release.json", "utf8"));
const base = process.env.SITE_URL;
if (!base || !/^https?:\/\//.test(base))
  throw new Error("Set SITE_URL to the deployed root or project URL.");
const url = (name) => new URL(name, base.endsWith("/") ? base : `${base}/`);
async function get(name) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(url(name));
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`Hosted resource unavailable: ${name}`);
}
const hosted = JSON.parse(await get("release.json"));
if (
  hosted.content_sha256 !== local.content_sha256 ||
  hosted.release_date !== local.release_date
)
  throw new Error(
    "Hosted release differs from the reviewed deployment artifact.",
  );
for (const name of [
  "index.html",
  "data/hrm/index.json",
  "data/hrm/income.csv",
  ...Object.keys(local.files).filter((name) => name.startsWith("assets/")),
]) {
  const bytes = await get(name);
  if (
    createHash("sha256").update(bytes).digest("hex") !==
    local.files[name].sha256
  )
    throw new Error(`Hosted bytes differ: ${name}`);
}
console.log(
  `Hosted release ${hosted.release_id} and its CSV match the reviewed artifact.`,
);
