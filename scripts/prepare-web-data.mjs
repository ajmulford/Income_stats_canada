import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rename,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { resolve, join } from "node:path";

const source = resolve("data/processed/hrm");
const target = resolve("public/data/hrm");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJSON = async (name) =>
  JSON.parse(await readFile(join(source, name), "utf8"));
const manifest = await readJSON("artifacts.json");
for (const [name, expected] of Object.entries(manifest.files)) {
  const bytes = await readFile(join(source, name));
  if (hash(bytes) !== expected.sha256)
    throw new Error(
      `Validated artifact changed: ${name}. Rebuild the data pipeline.`,
    );
}
const validation = await readJSON("validation.json");
if (validation.status !== "validated")
  throw new Error("A validated milestone-one dataset is required.");
const bandConfig = JSON.parse(
  await readFile(resolve("data/income-bands.json"), "utf8"),
);
if (
  bandConfig.income_year !== validation.income_reference_year ||
  bandConfig.currency !== "CAD" ||
  bandConfig.measure !== "median_before_tax_total_household_income"
)
  throw new Error("Band definition does not match income measure.");
const incomeBands = bandConfig.bands;
if (
  incomeBands.length !== 7 ||
  incomeBands[0].lower_inclusive_cad !== null ||
  incomeBands.at(-1).upper_exclusive_cad !== null ||
  incomeBands.some(
    (b, i) =>
      (i > 0 &&
        b.lower_inclusive_cad !== incomeBands[i - 1].upper_exclusive_cad) ||
      (i < incomeBands.length - 1 &&
        (!Number.isFinite(b.upper_exclusive_cad) ||
          b.upper_exclusive_cad <= (b.lower_inclusive_cad ?? 0))),
  )
)
  throw new Error(
    "Income bands must be ordered, continuous, and unbounded at the ends.",
  );
const geojson = await readJSON("income.geojson");
if (geojson.features.length !== validation.areas)
  throw new Error("Area count differs from validation.");
const rows = geojson.features.map(({ properties: p }) => ({
  id: p.da_uid,
  income: p.median_household_income_cad,
  status: p.availability_status,
  symbol: p.income_symbol,
  flag: p.geographic_quality_flag,
  caution: p.income_quality_caution,
  note: p.income_quality_note,
  source: p.source_url,
}));
if (new Set(rows.map((r) => r.id)).size !== rows.length)
  throw new Error("Duplicate area IDs.");

function bounds(geometry) {
  const result = [Infinity, Infinity, -Infinity, -Infinity];
  function visit(value) {
    if (typeof value[0] === "number") {
      result[0] = Math.min(result[0], value[0]);
      result[1] = Math.min(result[1], value[1]);
      result[2] = Math.max(result[2], value[0]);
      result[3] = Math.max(result[3], value[1]);
    } else value.forEach(visit);
  }
  visit(geometry.coordinates);
  return result;
}
const features = geojson.features.map((f) => ({
  type: "Feature",
  properties: { id: f.properties.da_uid },
  geometry: f.geometry,
  bbox: bounds(f.geometry),
}));
const unionBounds = (group) => [
  Math.min(...group.map((f) => f.bbox[0])),
  Math.min(...group.map((f) => f.bbox[1])),
  Math.max(...group.map((f) => f.bbox[2])),
  Math.max(...group.map((f) => f.bbox[3])),
];
// Spatially partition complete source polygons. No coordinate rounding or simplification.
function partition(group) {
  if (group.length <= 12) return [group];
  const b = unionBounds(group);
  const axis =
    (b[2] - b[0]) * Math.cos((44.7 * Math.PI) / 180) > b[3] - b[1] ? 0 : 1;
  group.sort(
    (a, b) =>
      a.bbox[axis] + a.bbox[axis + 2] - (b.bbox[axis] + b.bbox[axis + 2]) ||
      a.properties.id.localeCompare(b.properties.id),
  );
  const mid = Math.floor(group.length / 2);
  return [...partition(group.slice(0, mid)), ...partition(group.slice(mid))];
}
await mkdir(resolve("public/data"), { recursive: true });
const stage = await mkdtemp(resolve("public/data/.hrm-"));
const files = {};
async function write(name, bytes) {
  await writeFile(join(stage, name), bytes);
  files[name] = { bytes: bytes.length, sha256: hash(bytes) };
}
async function compressed(name, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  await write(name, bytes);
  await write(`${name}.gz`, gzipSync(bytes, { level: 9 }));
}
try {
  const chunks = [];
  for (const [i, group] of partition([...features]).entries()) {
    const file = `areas-${String(i).padStart(2, "0")}.json`;
    chunks.push({
      file,
      bbox: unionBounds(group),
      ids: group.map((f) => f.properties.id),
    });
    await compressed(file, { type: "FeatureCollection", features: group });
  }
  const restored = new Map();
  for (const chunk of chunks) {
    const saved = JSON.parse(
      gunzipSync(await readFile(join(stage, `${chunk.file}.gz`))).toString(),
    );
    for (const feature of saved.features) {
      if (restored.has(feature.properties.id))
        throw new Error("Duplicate delivered geometry.");
      restored.set(feature.properties.id, feature.geometry);
    }
  }
  if (restored.size !== geojson.features.length)
    throw new Error("Delivered geometry count differs.");
  for (const original of geojson.features) {
    if (
      JSON.stringify(restored.get(original.properties.da_uid)) !==
      JSON.stringify(original.geometry)
    ) {
      throw new Error(`Geometry changed for ${original.properties.da_uid}`);
    }
  }
  await compressed("all-areas.json", { type: "FeatureCollection", features });
  const places = (await readJSON("places.json")).map((p) => ({
    id: p.place_id,
    name: p.name,
    lat: p.latitude,
    lon: p.longitude,
    areas: p.containing_da_uids,
  }));
  await compressed("index.json", {
    city: "Halifax Regional Municipality",
    coverage: "Halifax municipal census subdivision 1209034",
    incomeYear: validation.income_reference_year,
    censusYear: validation.census_year,
    snapshotDate: "2026-10-06",
    sourceHash: manifest.files["income.geojson"].sha256,
    bounds: unionBounds(features),
    rows,
    places,
    chunks,
    incomeBands,
    bandsApprovedDate: bandConfig.approved_date,
    searchPolicy: "place_points_only_boundary_finality_unverified",
  });
  await write("income.csv", await readFile(join(source, "income.csv")));
  await write(
    "artifacts.json",
    Buffer.from(
      JSON.stringify(
        { sourceHash: manifest.files["income.geojson"].sha256, files },
        null,
        2,
      ),
    ),
  );
  await mkdir(resolve("reports"), { recursive: true });
  const report = {
    areas: rows.length,
    available: rows.filter((r) => r.status === "available").length,
    source_geometry_bytes: manifest.files["income.geojson"].bytes,
    all_geometry_gzip_bytes: files["all-areas.json.gz"].bytes,
    index_gzip_bytes: files["index.json.gz"].bytes,
    chunks: chunks.length,
    geometry_preserved_exactly: true,
    total_chunk_gzip_bytes: chunks.reduce(
      (total, c) => total + files[`${c.file}.gz`].bytes,
      0,
    ),
    csv_preserved_exactly:
      files["income.csv"].sha256 === manifest.files["income.csv"].sha256,
  };
  // Remove only this script's generated destination after successfully validating the stage.
  await rm(target, { recursive: true, force: true });
  await rename(stage, target);
  await writeFile(
    resolve("reports/web-data.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `Prepared ${rows.length} areas in ${chunks.length} lossless spatial chunks.`,
  );
} catch (error) {
  await rm(stage, { recursive: true, force: true });
  throw error;
}
