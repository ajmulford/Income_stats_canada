import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export async function verifyHostedRelease(local, base, options = {}) {
  if (!base || !/^https?:\/\//.test(base))
    throw new Error("Set SITE_URL to the deployed root or project URL.");
  const request = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  const url = name => new URL(name, base.endsWith("/") ? base : `${base}/`);
  async function get(name) {
    const response = await request(url(name), { cache: "no-store" });
    if (!response.ok) throw new Error(`Hosted resource unavailable: ${name} (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }
  // A new deployment may briefly coexist with older edge responses, even with
  // HTTP 200. Retry the complete checksum check, never accept mixed releases.
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const hosted = JSON.parse(await get("release.json"));
      if (hosted.content_sha256 !== local.content_sha256 || hosted.release_date !== local.release_date)
        throw new Error("Hosted release differs from the reviewed deployment artifact.");
      for (const name of ["index.html", "data/hrm/index.json", "data/hrm/income.csv",
        ...Object.keys(local.files).filter(name => name.startsWith("assets/"))]) {
        const bytes = await get(name);
        if (createHash("sha256").update(bytes).digest("hex") !== local.files[name].sha256)
          throw new Error(`Hosted bytes differ: ${name}`);
      }
      return hosted;
    } catch (error) {
      if (attempt === 5) throw error;
      await sleep(5000);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const local = JSON.parse(await readFile("dist/release.json", "utf8"));
  const hosted = await verifyHostedRelease(local, process.env.SITE_URL);
  console.log(`Hosted release ${hosted.release_id} and its CSV match the reviewed artifact.`);
}
