import type { Place } from "./data";

// Typographical normalization only: no unverified neighbourhood aliases.
export const normalizePlaceName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-CA")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function matchingPlaces(places: Place[], query: string): Place[] {
  const text = normalizePlaceName(query);
  if (!text) return [];
  return places
    .filter((p) => normalizePlaceName(p.name).includes(text))
    .sort(
      (a, b) =>
        Number(normalizePlaceName(b.name) === text) -
          Number(normalizePlaceName(a.name) === text) ||
        a.name.localeCompare(b.name, "en-CA") ||
        b.lat - a.lat ||
        a.id.localeCompare(b.id),
    );
}

export function locationLabel(place: Place, places: Place[]): string {
  const peers = places.filter(
    (p) => normalizePlaceName(p.name) === normalizePlaceName(place.name),
  );
  let direction = "Place location";
  if (peers.length === 2) {
    const other = peers.find((p) => p.id !== place.id)!;
    const northSouth = Math.abs(place.lat - other.lat);
    const eastWest =
      Math.abs(place.lon - other.lon) * Math.cos((place.lat * Math.PI) / 180);
    direction =
      northSouth >= eastWest
        ? place.lat > other.lat
          ? "Northern location"
          : "Southern location"
        : place.lon > other.lon
          ? "Eastern location"
          : "Western location";
  }
  return `${direction} · ${place.lat.toFixed(4)}° N · ${Math.abs(place.lon).toFixed(4)}° W`;
}
