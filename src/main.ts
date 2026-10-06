import { matchingPlaces, locationLabel } from "./place-search";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import {
  bandIndex,
  colours,
  dataURL,
  dollars,
  intersects,
  loadJSON,
} from "./data";
import type {
  Area,
  AreasGeoJSON,
  Band,
  Bounds,
  Chunk,
  Index,
  Place,
} from "./data";

const element = <T extends HTMLElement>(id: string) => {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing element: ${id}`);
  return result as T;
};
function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
) {
  const result = document.createElement(tag);
  result.textContent = text;
  result.className = className;
  return result;
}
const status = element("map-status");
const list = element("area-list");
const filter = element<HTMLInputElement>("area-filter");
const areaSort = element<HTMLSelectElement>("area-sort");
const placeSearch = element<HTMLInputElement>("place-search");
const previous = element<HTMLButtonElement>("previous-page");
const next = element<HTMLButtonElement>("next-page");
const retry = element<HTMLButtonElement>("retry-map");
const map = L.map("map", {
  preferCanvas: true,
  // Full municipal bounds need zoom 6 on narrow phone screens.
  minZoom: 6,
  maxZoom: 18,
  zoomControl: false,
  scrollWheelZoom: false,
  zoomAnimation: false,
  fadeAnimation: false,
  markerZoomAnimation: false,
}).setView([44.664, -63.589], 13);
let wheelDelta = 0;
let wheelTimer: ReturnType<typeof setTimeout> | undefined;
map.getContainer().addEventListener(
  "wheel",
  (event) => {
    if (!event.ctrlKey || event.deltaY === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? map.getSize().y : 1;
    wheelDelta += event.deltaY * unit;
    const position = map.mouseEventToContainerPoint(event);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      const steps = Math.min(4, Math.ceil(Math.abs(wheelDelta) / 120));
      const zoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() - Math.sign(wheelDelta) * steps));
      wheelDelta = 0;
      map.setZoomAround(position, zoom);
    }, 40);
  },
  { passive: false },
);
L.control.zoom({ position: "topleft" }).addTo(map);
map.attributionControl.setPosition("topright");
map.attributionControl.addAttribution(
  '<a href="https://www150.statcan.gc.ca/n1/en/catalogue/98-401-X2021006">Statistics Canada, 2021 Census</a>',
);
const incomeOverlay = L.layerGroup().addTo(map);
let incomeOpacity = 0.45;
const overlayToggle = element<HTMLInputElement>("show-income");
const opacityControl = element<HTMLInputElement>("income-opacity");
const layers = new Map<string, L.Path>();
const inFlight = new Map<string, Promise<void>>();
const loaded = new Set<string>();
let index: Index;
let rows: Map<string, Area>;
let selected: string | null = null;
let currentPage = 0;
let listRows: Area[] = [];
let marker: L.CircleMarker | null = null;
let loadingGeneration = 0;
let tileLayer: L.TileLayer | null = null;
const PAGE_SIZE = 30;
const query = new URLSearchParams(location.search);
const baseline = query.get("geometry") === "all";

function rowLabel(row: Area) {
  return row.income === null ? "Income unavailable" : dollars(row.income);
}
function style(id: string): L.PathOptions {
  const row = rows.get(id)!;
  return {
    fillColor:
      row.income === null
        ? "#d8d8d3"
        : colours[bandIndex(row.income, index.incomeBands)],
    // Let street lines and labels remain readable beneath the income shading.
    fillOpacity: incomeOpacity,
    color: selected === id ? "#101f1d" : "#f8faf5",
    weight: selected === id ? 3 : 0.65,
    opacity: selected === id ? 1 : 0.75,
  };
}
overlayToggle.addEventListener("change", () => {
  if (overlayToggle.checked) {
    incomeOverlay.addTo(map);
    if (selected) layers.get(selected)?.bringToFront();
  }
  else incomeOverlay.remove();
  opacityControl.disabled = !overlayToggle.checked;
});
opacityControl.addEventListener("input", () => {
  incomeOpacity = Number(opacityControl.value) / 100;
  element("opacity-value").textContent = `${opacityControl.value}%`;
  opacityControl.setAttribute("aria-valuetext", `${opacityControl.value} percent`);
  for (const [id, layer] of layers) layer.setStyle(style(id));
});
function leafletBounds(b: Bounds) {
  return L.latLngBounds([b[1], b[0]], [b[3], b[2]]);
}
function mapBounds(): Bounds {
  const b = map.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}
async function loadChunk(chunk: Chunk): Promise<void> {
  if (loaded.has(chunk.file)) return;
  const pending = inFlight.get(chunk.file);
  if (pending) return pending;
  const task = (async () => {
    const collection = await loadJSON<AreasGeoJSON>(chunk.file);
    const expected = new Set(chunk.ids);
    if (
      collection.features.length !== expected.size ||
      new Set(collection.features.map((f) => f.properties.id)).size !==
        expected.size ||
      collection.features.some(
        (f) => !expected.has(f.properties.id) || !rows.has(f.properties.id),
      )
    ) {
      throw new Error("Geometry does not match the validated area index.");
    }
    L.geoJSON(collection, {
      style: (feature) => style(feature!.properties.id),
      onEachFeature: (feature, layer) => {
        const id = feature.properties.id;
        layers.set(id, layer as L.Path);
        layer.on("click", () => {
          void selectArea(id, false);
        });
      },
    }).addTo(incomeOverlay);
    loaded.add(chunk.file);
    document.body.dataset.loadedAreas = String(layers.size);
  })();
  inFlight.set(chunk.file, task);
  try {
    await task;
  } finally {
    inFlight.delete(chunk.file);
  }
}
async function loadVisible(initial = false): Promise<void> {
  if (!index) return;
  const generation = ++loadingGeneration;
  document.body.dataset.mapState = "loading";
  retry.hidden = true;
  status.textContent = "Loading census areas…";
  status.hidden = false;
  try {
    const chunks = baseline
      ? [
          {
            file: "all-areas.json",
            ids: index.rows.map((r) => r.id),
            bbox: index.bounds,
          },
        ]
      : index.chunks.filter((c) => intersects(c.bbox, mapBounds()));
    // Browsers schedule these static requests; each is an independently retryable chunk.
    await Promise.all(chunks.map(loadChunk));
    if (generation === loadingGeneration) {
      status.textContent = "Census areas ready";
      status.hidden = true;
      document.body.dataset.mapState = "ready";
    }
    if (initial && !document.body.dataset.usabilityReady) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      performance.mark("income-map-usable");
      document.body.dataset.usabilityReady = "true";
      enableBasemap();
    }
  } catch (error) {
    console.error(error);
    if (generation === loadingGeneration) {
      document.body.dataset.mapState = "error";
      status.textContent =
        "Some census areas could not load. The income list and CSV remain available.";
      retry.hidden = false;
    }
  }
}
function enableBasemap() {
  const message = element("basemap-status");
  if (query.get("basemap") === "off" || !index.basemap.enabled) {
    message.textContent =
      "Street map is off. Income areas and place locations remain available.";
    message.hidden = false;
    return;
  }
  if (tileLayer) return;
  let errors = 0;
  tileLayer = L.tileLayer(index.basemap.url, {
    maxZoom: index.basemap.maxZoom,
    attribution: index.basemap.attribution,
  }).addTo(map);
  tileLayer.on("tileerror", () => {
    if (++errors >= 2) {
      message.hidden = false;
      tileLayer?.remove();
    }
  });
}
const detailsToggle = element<HTMLButtonElement>("toggle-details");
const phoneDetails = matchMedia("(max-width: 760px)");
function setDetailsExpanded(expanded: boolean) {
  expanded = expanded || !phoneDetails.matches;
  detailsToggle.setAttribute("aria-expanded", String(expanded));
  detailsToggle.textContent = expanded ? "Collapse details" : "Expand details";
  element("details").hidden = !expanded;
}
phoneDetails.addEventListener("change", () => {
  if (!phoneDetails.matches) setDetailsExpanded(true);
});
detailsToggle.addEventListener("click", () =>
  setDetailsExpanded(detailsToggle.getAttribute("aria-expanded") !== "true"),
);
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    matchMedia("(max-width: 760px)").matches &&
    element("selection-panel").classList.contains("has-selection")
  ) {
    setDetailsExpanded(false);
    detailsToggle.focus({ preventScroll: true });
  }
});
function revealFocusedControl() {
  const active = document.activeElement;
  const panel = element("selection-panel");
  if (
    !matchMedia("(max-width: 760px)").matches ||
    !panel.classList.contains("has-selection") ||
    !(active instanceof HTMLElement) ||
    panel.contains(active) ||
    !active.matches("button, input, select, a")
  )
    return;
  const bottom = active.getBoundingClientRect().bottom;
  const top = panel.getBoundingClientRect().top;
  if (bottom > top - 12)
    window.scrollBy({ top: bottom - top + 24, behavior: "instant" });
}
document.addEventListener("focusin", () =>
  requestAnimationFrame(revealFocusedControl),
);
function showSelectionPanel() {
  element("selection-panel").classList.add("has-selection");
  document.body.classList.add("has-selection");
  setDetailsExpanded(true);
  // Opening the phone panel also changes the map height.
  if (matchMedia("(max-width: 760px)").matches)
    map.invalidateSize({ pan: false });
  requestAnimationFrame(revealFocusedControl);
}
function renderDetails(row: Area) {
  showSelectionPanel();
  element("details-title").textContent = `Census area ${row.id}`;
  const content = element("details");
  const amount = node(
    "p",
    rowLabel(row),
    row.income === null ? "income-value unavailable" : "income-value",
  );
  const measure = node(
    "p",
    "Median before-tax household income",
    "measure-label",
  );
  const date = node("p", "2020 income · 2021 Census · CAD", "details-date");
  const pieces: HTMLElement[] = [amount, measure, date];
  if (row.note)
    pieces.push(
      node(
        "p",
        row.note,
        row.income === null ? "data-notice" : "data-notice caution",
      ),
    );
  if (row.caution && !row.note)
    pieces.push(
      node("p", "Use this reported value with caution.", "data-notice caution"),
    );
  pieces.push(
    node(
      "p",
      "This statistic describes households across the census area, not an individual home.",
      "small-note",
    ),
  );
  pieces.push(
    node(
      "p",
      "Household totals are not adjusted for household size, taxes, or living costs.",
      "small-note",
    ),
  );
  const source = node("a", "View the official source ↗", "source-link");
  source.href = row.source;
  source.target = "_blank";
  source.rel = "noopener";
  pieces.push(source);
  content.replaceChildren(...pieces);
}
function revealSelectedView() {
  const phone = matchMedia("(max-width: 760px)").matches;
  if (phone) {
    map.getContainer().focus({ preventScroll: true });
    window.scrollBy({
      top: map.getContainer().getBoundingClientRect().top - 8,
      behavior: "instant",
    });
  }
  if (!phone) {
    const heading = element("details-title");
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    window.scrollBy({
      top: element("selection-panel").getBoundingClientRect().top - 16,
      behavior: "instant",
    });
  }
}
async function selectArea(id: string, navigate: boolean, revealMap = false) {
  const row = rows.get(id);
  if (!row) return;
  const before = selected;
  selected = id;
  if (before) layers.get(before)?.setStyle(style(before));
  renderDetails(row);
  renderList();
  const chunk = baseline
    ? {
        file: "all-areas.json",
        ids: index.rows.map((r) => r.id),
        bbox: index.bounds,
      }
    : index.chunks.find((c) => c.ids.includes(id));
  if (!chunk) return;
  try {
    await loadChunk(chunk);
    if (selected !== id) return;
    const layer = layers.get(id) as L.Polygon;
    layer.setStyle(style(id));
    if (map.hasLayer(layer)) layer.bringToFront();
    if (navigate) {
      if (revealMap) revealSelectedView();
      map.fitBounds(layer.getBounds(), {
        padding: [30, 30],
        maxZoom: 15,
        animate: false,
      });
    }
  } catch (error) {
    console.error(error);
    status.textContent =
      "Selected income is available in the details. Its map shape could not load.";
    status.hidden = false;
    retry.hidden = false;
  }
}
function renderList() {
  listRows.sort((a, b) => {
    const mode = areaSort.value;
    const byId = a.id.localeCompare(b.id);
    if (mode === "area-asc") return byId;
    if (mode === "area-desc") return -byId;
    // Suppressed values are unknown, rather than zero, in either direction.
    if (a.income === null) return b.income === null ? byId : 1;
    if (b.income === null) return -1;
    const difference = a.income - b.income;
    return (mode === "income-desc" ? -difference : difference) || byId;
  });
  const focusedId =
    document.activeElement instanceof HTMLElement
      ? document.activeElement.dataset.areaId
      : undefined;
  const pages = Math.max(1, Math.ceil(listRows.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pages - 1);
  const start = currentPage * PAGE_SIZE;
  const current = listRows.slice(start, start + PAGE_SIZE);
  list.replaceChildren(
    ...current.map((row) => {
      const item = node("li");
      const button = node("button", "", "area-row");
      button.type = "button";
      button.dataset.areaId = row.id;
      button.setAttribute("aria-pressed", String(selected === row.id));
      const label = node("span", row.id, "area-id");
      const income = node("span", rowLabel(row), "area-income");
      const text = `Census area ${row.id}, ${rowLabel(row)}${row.caution ? ", use with caution" : ""}`;
      button.setAttribute("aria-label", text);
      button.append(label, income);
      if (row.caution) button.append(node("span", "Caution", "caution-badge"));
      button.addEventListener("click", (event) => {
        // Pointer selection reveals the selected view; keyboard selection retains list focus.
        void selectArea(row.id, true, event.detail > 0);
      });
      item.append(button);
      return item;
    }),
  );
  element("list-status").textContent = current.length
    ? `${start + 1}–${start + current.length} of ${listRows.length} areas`
    : "No census areas match this number.";
  element("page-number").textContent = `Page ${currentPage + 1} of ${pages}`;
  previous.disabled = currentPage === 0;
  next.disabled = currentPage >= pages - 1;
  if (focusedId)
    list
      .querySelector<HTMLButtonElement>(`button[data-area-id="${focusedId}"]`)
      ?.focus({ preventScroll: true });
}
function renderLegend(bands: Band[]) {
  element("legend-bands").replaceChildren(
    ...bands.map((band, i) => {
      const label =
        band.lower_inclusive_cad === null
          ? `Below $${band.upper_exclusive_cad! / 1000}k`
          : band.upper_exclusive_cad === null
            ? `$${band.lower_inclusive_cad / 1000}k or more`
            : `$${band.lower_inclusive_cad / 1000}k–<$${band.upper_exclusive_cad / 1000}k`;
      const item = node("li");
      const swatch = node("span", "", "swatch");
      swatch.style.backgroundColor = colours[i];
      swatch.setAttribute("aria-hidden", "true");
      item.append(swatch, node("span", label));
      return item;
    }),
    (() => {
      const item = node("li");
      const swatch = node("span", "", "swatch");
      swatch.style.backgroundColor = "#d8d8d3";
      swatch.setAttribute("aria-hidden", "true");
      item.append(swatch, node("span", "Unavailable"));
      return item;
    })(),
  );
}
function selectPlace(place: Place, reveal = false) {
  showSelectionPanel();
  marker?.remove();
  marker = L.circleMarker([place.lat, place.lon], {
    radius: 6,
    fillColor: "#fff",
    color: "#172d29",
    weight: 2,
    fillOpacity: 1,
  }).addTo(map);
  const label = node("span", place.name);
  marker.bindTooltip(label, { permanent: true, direction: "top" });
  map.setView([place.lat, place.lon], 14, { animate: false });
  if (place.areas.length === 1) {
    void selectArea(place.areas[0], false);
    element("place-status").textContent =
      `Census area containing this place location: ${place.name}. This does not represent the entire community.`;
  } else {
    element("place-status").textContent =
      `${place.name}: this place point has no single containing census area. No income has been assigned to this location; use the full area list.`;
    selected = null;
    for (const [id, layer] of layers) layer.setStyle(style(id));
    element("details-title").textContent = "No containing census area";
    element("details").replaceChildren(
      node(
        "p",
        "This verified place location has no single census-area match. Choose an area from the list to inspect its reported income.",
        "empty-description",
      ),
    );
    renderList();
  }
  if (reveal) revealSelectedView();
}
function searchPlaces() {
  const text = placeSearch.value.trim();
  const matches = matchingPlaces(index.places, text);
  element("place-results").replaceChildren(
    ...matches.slice(0, 10).map((place) => {
      const item = node("li");
      const button = node("button", "", "place-result");
      button.type = "button";
      // Directions compare verified source points; coordinates retain precise context.
      button.append(
        node("strong", place.name),
        node("span", locationLabel(place, index.places)),
      );
      button.dataset.placeId = place.id;
      button.append(
        node(
          "span",
          place.areas.length === 1
            ? `Census area ${place.areas[0]}`
            : "Outside a single mapped census area",
        ),
      );
      button.addEventListener("click", (event) => selectPlace(place, event.detail > 0));
      item.append(button);
      return item;
    }),
  );
  element("place-status").textContent = !text
    ? "Place locations identify a point, not a whole community."
    : !matches.length
      ? "No place locations match this name. Try a nearby community or browse the census area list; some neighbourhood names are absent from the source."
      : `${matches.length} matching place locations${matches.length > 10 ? "; showing the first 10. Refine your search to see others" : ""}. Choose a location.`;
}
async function initialise() {
  try {
    index = await loadJSON<Index>("index.json");
    if (new Set(index.rows.map((r) => r.id)).size !== index.rows.length)
      throw new Error("Duplicate area index.");
    rows = new Map(index.rows.map((r) => [r.id, r]));
    listRows = [...index.rows];
    renderList();
    renderLegend(index.incomeBands);
    element("total-areas").textContent = String(index.rows.length);
    filter.disabled = false;
    areaSort.disabled = false;
    areaSort.addEventListener("change", () => {
      currentPage = 0;
      renderList();
    });
    placeSearch.disabled = false;
    const download = element<HTMLAnchorElement>("download-csv");
    download.href = dataURL("income.csv");
    download.download = "hrm-income-2020.csv";
    download.removeAttribute("aria-disabled");
    filter.addEventListener("input", () => {
      currentPage = 0;
      listRows = index.rows.filter((row) =>
        row.id.includes(filter.value.trim()),
      );
      renderList();
    });
    placeSearch.addEventListener("input", searchPlaces);
    previous.addEventListener("click", () => {
      currentPage--;
      renderList();
    });
    next.addEventListener("click", () => {
      currentPage++;
      renderList();
    });
    element("full-view").addEventListener("click", () =>
      map.fitBounds(leafletBounds(index.overviewBounds), {
        padding: [16, 16],
        animate: false,
      }),
    );
    element("urban-view").addEventListener("click", () =>
      map.setView([44.664, -63.589], 13, { animate: false }),
    );
    map.on("moveend", () => {
      void loadVisible();
    });
    retry.addEventListener("click", () => {
      if (selected) void selectArea(selected, false);
      void loadVisible(!document.body.dataset.usabilityReady);
    });
    performance.mark("income-index-ready");
    await loadVisible(true);
  } catch (error) {
    console.error(error);
    document.body.dataset.mapState = "error";
    status.textContent =
      "Income data could not load. Reload the page to try again.";
    element("list-status").textContent =
      "The dataset is unavailable. No income values have been substituted.";
  }
}
void initialise();
