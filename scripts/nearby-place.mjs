// Great-circle distance between longitude/latitude points, in kilometres.
export function distanceKm(a, b) {
  const radians = Math.PI / 180;
  const latitudeDifference = (b[1] - a[1]) * radians;
  const longitudeDifference = (b[0] - a[0]) * radians;
  const h = Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(a[1] * radians) * Math.cos(b[1] * radians) *
    Math.sin(longitudeDifference / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function nearestPlace(bounds, places) {
  const centre = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
  let nearest = null;
  for (const place of places) {
    const distance = distanceKm(centre, [place.longitude, place.latitude]);
    if (!nearest || distance < nearest.distanceKm ||
      (distance === nearest.distanceKm && place.place_id < nearest.id)) {
      nearest = { id: place.place_id, name: place.name, distanceKm: distance };
    }
  }
  return nearest;
}
