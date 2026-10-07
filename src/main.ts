import { normalizePlaceName } from "./place-search";
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
const sortButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-sort]")];
let sortColumn = "area";
let sortDescending = false;
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
const placeNamesByArea = new Map<string, string[]>();
function areaPlaceLabel(id: string): string {
  const names = placeNamesByArea.get(id);
  if (names?.length) return `Near or part of: ${names.join(", ")}`;
  const nearby = rows.get(id)?.nearbyPlace;
  return nearby ? `Near or part of: ${nearby.name}` : "";
}
let rows: Map<string, Area>;
let selected: string | null = null;
let currentPage = 0;
let listRows: Area[] = [];
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
          void selectArea(id, false, true);
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
  const placeLabel = areaPlaceLabel(row.id);
  pieces.push(node("p", placeLabel || "No named place location is linked to this area in the reviewed source.", "area-location"));
  if (placeNamesByArea.has(row.id))
    pieces.push(node("p", "These names identify points within the census area. They do not define its boundary or represent income for an entire community.", "small-note"));
  else if (row.nearbyPlace)
    pieces.push(node("p", "No named place location is linked within this area. This approximate label uses the nearest reviewed place point to the centre of the area's map bounds. That centre can fall outside an irregular area. The label does not establish community membership or community-wide income.", "small-note"));
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
  if (revealMap) revealSelectedView();
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
  element("total-areas").textContent = String(listRows.length);
  listRows.sort((a, b) => {
    const mode = `${sortColumn}-${sortDescending ? "desc" : "asc"}`;
    const byId = a.id.localeCompare(b.id);
    if (mode === "area-asc") return byId;
    if (mode === "area-desc") return -byId;
    if (sortColumn === "place") {
      const difference = areaPlaceLabel(a.id).localeCompare(areaPlaceLabel(b.id), "en-CA");
      return (sortDescending ? -difference : difference) || byId;
    }
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
      const item = node("tr");
      const button = node("button", "", "area-row");
      button.type = "button";
      button.dataset.areaId = row.id;
      button.setAttribute("aria-pressed", String(selected === row.id));
      const label = node("span", row.id, "area-id");
      const identity = node("span", "", "area-identity");
      identity.append(label);
      const placeLabel = areaPlaceLabel(row.id);

      const income = node("span", rowLabel(row), "area-income");
      const text = `Census area ${row.id}, ${rowLabel(row)}${row.caution ? ", use with caution" : ""}${placeLabel ? `, ${placeLabel}` : ""}`;
      button.setAttribute("aria-label", text);
      button.append(identity);
      if (row.caution) button.append(node("span", "Caution", "caution-badge"));
      item.addEventListener("click", (event) => {
        // Button activation bubbles here; each row has one keyboard selection control.
        // Pointer selection reveals the selected view; keyboard selection retains list focus.
        void selectArea(row.id, true, event.detail > 0);
      });
      const idCell = node("td");
      idCell.append(button);
      const placeCell = node("td", placeLabel.replace(/^Near or part of: /, ""), "area-place");
      const incomeCell = node("td");
      incomeCell.append(income);
      item.append(idCell, placeCell, incomeCell);
      item.classList.toggle("selected-area", selected === row.id);
      return item;
    }),
  );
  element("list-status").textContent = current.length
    ? `${start + 1}–${start + current.length} of ${listRows.length} areas`
    : "No census areas match this name or number.";
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
function filterAreas() {
  const text = placeSearch.value.trim();
  const normalized = normalizePlaceName(text);
  listRows = index.rows.filter(row => !normalized || row.id.includes(text) ||
    normalizePlaceName(areaPlaceLabel(row.id)).includes(normalized));
  currentPage = 0;
  renderList();
}
async function initialise() {
  try {
    index = await loadJSON<Index>("index.json");
    if (new Set(index.rows.map((r) => r.id)).size !== index.rows.length)
      throw new Error("Duplicate area index.");
    rows = new Map(index.rows.map((r) => [r.id, r]));
    placeNamesByArea.clear();
    for (const place of index.places) {
      if (place.areas.length !== 1 || !rows.has(place.areas[0])) continue;
      const id = place.areas[0];
      const names = placeNamesByArea.get(id) ?? [];
      if (!names.includes(place.name)) names.push(place.name);
      placeNamesByArea.set(id, names);
    }
    for (const names of placeNamesByArea.values()) names.sort((a, b) => a.localeCompare(b, "en-CA"));
    listRows = [...index.rows];
    renderList();
    renderLegend(index.incomeBands);
    for (const button of sortButtons) {
      button.disabled = false;
      button.addEventListener("click", () => {
        const column = button.dataset.sort!;
        sortDescending = sortColumn === column ? !sortDescending : column === "income";
        sortColumn = column;
        for (const control of sortButtons) {
          const active = control === button;
          if (active) control.parentElement!.setAttribute("aria-sort", sortDescending ? "descending" : "ascending");
          else control.parentElement!.removeAttribute("aria-sort");
          control.querySelector("span")!.textContent = active ? (sortDescending ? "↓" : "↑") : "↕";
        }
        currentPage = 0;
        renderList();
      });
    }
    placeSearch.disabled = false;
    const download = element<HTMLAnchorElement>("download-csv");
    download.href = dataURL("income.csv");
    download.download = "hrm-income-2020.csv";
    download.removeAttribute("aria-disabled");
    placeSearch.addEventListener("input", filterAreas);
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
