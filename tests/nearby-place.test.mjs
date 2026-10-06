import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, nearestPlace } from "../scripts/nearby-place.mjs";

test("great-circle distances handle identical points, latitude, and the date line", () => {
  assert.equal(distanceKm([-63, 44], [-63, 44]), 0);
  assert.ok(Math.abs(distanceKm([0, 0], [0, 1]) - 111.195) < 0.001);
  assert.ok(Math.abs(distanceKm([179, 0], [-179, 0]) - 222.390) < 0.001);
});

test("nearest point uses bounds centre, with deterministic ties and empty input", () => {
  const place = (id, longitude, latitude) => ({ place_id: id, name: id, longitude, latitude });
  const places = [place("far", 5, 5), place("b", -1, 0), place("a", 1, 0)];
  assert.equal(nearestPlace([-2, -2, 2, 2], places).id, "a");
  assert.equal(nearestPlace([-2, -2, 2, 2], places.slice().reverse()).id, "a");
  assert.equal(nearestPlace([-2, -2, 2, 2], []), null);
});
