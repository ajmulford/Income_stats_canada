import type { FeatureCollection, Geometry } from "geojson";

export interface Area {
  id: string;
  income: number | null;
  status: string;
  symbol: string;
  flag: string;
  caution: boolean;
  note: string;
  source: string;
}
export interface Place {
  id: string;
  name: string;
  lat: number;
  lon: number;
  areas: string[];
}
export type Bounds = [number, number, number, number];
export interface Chunk {
  file: string;
  bbox: Bounds;
  ids: string[];
}
export interface Band {
  lower_inclusive_cad: number | null;
  upper_exclusive_cad: number | null;
}
export interface Index {
  basemap: {
    enabled: boolean;
    url: string;
    maxZoom: number;
    attribution: string;
  };
  city: string;
  incomeYear: number;
  censusYear: number;
  snapshotDate: string;
  sourceHash: string;
  bounds: Bounds;
  rows: Area[];
  places: Place[];
  chunks: Chunk[];
  incomeBands: Band[];
}
export type AreasGeoJSON = FeatureCollection<Geometry, { id: string }>;
export const dataURL = (name: string) =>
  `${import.meta.env.BASE_URL}data/hrm/${name}`;
export const dollars = (value: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
export const colours = [
  "#edf2df",
  "#d4e2c6",
  "#adcdb5",
  "#7cb5a3",
  "#4b938b",
  "#286d68",
  "#144c4c",
];

export function bandIndex(value: number, bands: Band[]): number {
  const index = bands.findIndex(
    (b) =>
      (b.lower_inclusive_cad === null || value >= b.lower_inclusive_cad) &&
      (b.upper_exclusive_cad === null || value < b.upper_exclusive_cad),
  );
  if (index < 0) throw new Error("Income has no matching band.");
  return index;
}

export async function loadJSON<T>(name: string): Promise<T> {
  const compressed = typeof DecompressionStream !== "undefined";
  const response = await fetch(dataURL(name + (compressed ? ".gz" : "")));
  if (!response.ok)
    throw new Error(`Unable to load ${name} (${response.status}).`);
  // Servers may advertise gzip and let the browser decode it automatically.
  // GitHub Pages may instead serve .gz as a plain binary asset.
  if (
    !compressed ||
    response.headers.get("Content-Encoding")?.includes("gzip")
  ) {
    return response.json() as Promise<T>;
  }
  if (!response.body) throw new Error("Empty data response.");
  return new Response(
    response.body.pipeThrough(new DecompressionStream("gzip")),
  ).json() as Promise<T>;
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}
