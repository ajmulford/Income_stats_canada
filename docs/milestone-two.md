# Milestone two: prove the complete interaction

Completed October 6, 2026. The local prototype connects the milestone-one reviewed dataset to a working map, selection details, accessible area list, and identical CSV export. It contains all 604 HRM dissemination areas: 599 published medians and five confidentiality-suppressed values. This completes development-sequence milestone two; it is not a published release.

## Implemented behaviour

- Select a polygon or an area-list button to see its reported median before-tax household income, 2020 reference year, 2021 geography, identifier, availability, applicable quality notes, and official source link.
- Suppressed values stay null and appear as selectable neutral polygons and “Income unavailable” list entries. They never become zero or an estimated value.
- Filter the keyboard-accessible list by identifier and navigate its 30-row pages. Selection retains keyboard focus and announces updated details.
- Download the exact original validated CSV. All income values and statuses come from the same source release as the polygons.
- Switch between the opening urban viewport and full HRM. Geometry loads on demand and can be retried after a failed request; the income list and download remain independent of geometry.
- Use a preliminary point lookup for the 364 reviewed GeoSuite place records. Duplicate names require a choice, with coordinates distinguishing locations. A point outside selected census geography receives no income. The interface explains that a point's area does not represent an entire community.
- Income functionality survives missing street tiles. Tiles are requested only after initial income usability. Browser tests and measurements make no requests to the public OSM tile service.

Draft dollar bands come directly from the milestone-one distribution proposal and are labelled as drafts. Their thresholds and final palette remain a milestone-three decision. The search prototype does not resolve the documented community-boundary consultation issues.

## Lossless delivery

The builder checks every reviewed artifact's SHA-256 against the source artifact manifest before generating browser data. Browser geometry keeps every original WGS84 coordinate, including multipart polygons and holes. Only redundant attributes are moved into the shared area index; no rounding or simplification occurs. The builder reads the saved compressed files back and checks geometry equality and complete unique coverage for all 604 identifiers. CSV bytes match the source checksum.

| Artifact | Size |
| --- | ---: |
| Original income GeoJSON | 8,280,444 bytes |
| Complete geometry, compressed | 2,544,388 bytes |
| Shared income/place/chunk index, compressed | 18,960 bytes |
| 64 spatial chunks, compressed total | 2,577,562 bytes |

Chunks contain at most 12 complete areas and are loaded when their bounding boxes intersect the viewport. Large rural polygons remain intact. The modest increase in total bytes buys a smaller opening request set; it does not change geography. Both gzip and plain JSON are published. The reader handles hosts that return raw gzip bytes and hosts that automatically decode Content-Encoding, with a plain JSON fallback when streaming decompression is unavailable.

See [delivery report](../reports/web-data.json). Generated browser artifacts live under `public/data/hrm/`, are ignored by Git, and are copied into `dist/` by the production build. No original bulk input archives are included.

## Verification

`npm run build` passed checksum verification, lossless delivery verification, TypeScript checking, and the production build. Ten Playwright checks passed in Chrome 154:

1. A real polygon click and list selection agree with independently checked DA 12090312 ($50,800).
2. Suppressed DA 12090104 remains unavailable; keyboard selection retains focus and links to its correct source.
3. Duplicate Bedford results require a choice; the uncontained Terence Bay point receives no income.
4. Downloaded CSV matches the validated export byte for byte.
5. Failed street tiles preserve income, place lookup, and downloads.
6. A failed geometry request recovers through the retry control while the list remains available.
7. The 390-pixel phone layout has no horizontal overflow; automated Axe WCAG 2 A/AA and 2.1 AA checks report no violations before and after suppressed-area selection.
8. Full-HRM and urban controls work; an unknown identifier does not fabricate results.
9. Raw gzip responses without Content-Encoding work.
10. Plain JSON works when streaming decompression is unavailable.

Desktop and phone previews were also visually inspected. Automated accessibility checks do not establish full WCAG conformance or replace manual screen-reader and device testing.

## Mobile performance evidence

Measured against the production build served by local Vite preview, using Chrome 154 on macOS. Each run uses a new browser context with cache disabled, a 390×844 touch viewport at device scale 3, 150 ms network latency, 1.6 Mbps download, 750 Kbps upload, and 4× CPU slowdown. The server supplied compressed JS/CSS; deployed-host compression remains a release verification item.

Timing starts at navigationStart and ends after the index, list, place lookup, and every initial-viewport geometry chunk have loaded and two animation frames have elapsed. A genuine touch selection follows readiness and verifies the source amount. Basemap tiles are excluded so their availability cannot determine income usability.

| Delivery | Cold-cache usable map | Subsequent selection |
| --- | ---: | ---: |
| Complete geometry baseline | 14.048 s | 198 ms |
| Spatial chunks, run 1 | 3.347 s | 105 ms |
| Spatial chunks, run 2 | 3.343 s | 103 ms |
| Spatial chunks, run 3 | 3.348 s | 112 ms |

Median chunked time is **3.347 seconds**; all three runs pass the provisional five-second target. The full baseline fails, so the prototype uses viewport chunks by default. The measurement script retains the `?geometry=all` baseline for repeatable comparison.

See [raw measurements](../reports/mobile-performance.json) and [measurement script](../scripts/measure-mobile.mjs). These are local browser-emulation results, not a guarantee for physical phones, slower devices, plain-JSON delivery, full-HRM loading, rural navigation, or a live GitHub Pages deployment.

## Handoff to milestone three

Complete and review community-boundary versus place-point navigation, curated disambiguation labels and verified aliases, mobile selection-panel behaviour, income thresholds and palette, and remaining resident workflows. Preserve the verified data contract and rerun the relevant browser/performance checks after interface changes. Milestone four still owns manual accessibility/browser/device checks, deployed-host and cost verification, and the reviewed GitHub Pages release.

Run instructions are in [README](../README.md). No commit, push, or deployment was performed for milestone two.
