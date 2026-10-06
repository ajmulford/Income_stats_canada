# Milestone three: complete resident workflows

Completed October 6, 2026. The local resident interface now includes reviewed place-point navigation, explicit ambiguous-result choices, a collapsible mobile selection panel, approved fixed income bands, interpretation notes, and the existing full-HRM, accessible-list, quality-notice, download, and basemap-fallback workflows. No publication, push, or commit was performed.

## Search and navigation decision

The 364 verified GeoSuite place records remain scoped to HRM. Search normalizes case, accents, punctuation, and whitespace; exact names appear before partial matches. Duplicate names remain distinct choices and are never silently resolved to the first result. Directional labels compare the two actual source coordinates (for example, eastern versus western Bedford locations); coordinates and the containing census-area identifier provide further context. Search results and status messages are keyboard accessible.

The reviewed place inventory supplies no verified aliases, so this release does not invent alternate neighbourhood names. Unsupported names explain the source coverage and suggest a nearby community or the complete census-area list. Results are limited to ten at a time, with an explicit refinement message when more match.

The current HRM civic-community inventory does not certify per-feature boundary finality, so every result uses the agreed place-point fallback. This is a completed initial-release navigation decision, rather than an implicit promise that valid polygons represent consulted boundaries. See [navigation decision](adr/0002-place-point-navigation.md). No civic polygons are used to assign or aggregate income.

Choosing a contained point shows the containing area's own reported income and explains that it does not represent the whole community. Choosing the uncontained Terence Bay point clears the previous area selection and shows a no-assigned-income explanation. The full area list remains available in both cases.

## Phone and interpretation workflows

After area or place selection, phone details appear in a fixed bottom panel. The panel has a bounded height and scrollable content so its source link and interpretation notes remain reachable. Collapse/expand works with touch or keyboard; Escape collapses the phone panel and focuses its toggle. List selection retains its button focus, and focused controls outside the panel are scrolled into view when necessary. Essential information does not require hover. On desktop, the same details remain in the sidebar.

Minimum phone button heights are 44 pixels. The phone legend uses two columns for readable labels; unavailable income stays outside the sequential colour scale. Reduced-motion preferences disable transitions. Full-HRM and urban navigation, area filtering/pagination, and source/download links continue to work. A failed selected-area geometry request can be retried along with visible geometry.

The page and area details explicitly identify 2020 income, the 2021 Census/geography, Canadian dollars, before-tax household totals, and the limits of comparisons. The source section notes possible pandemic-era effects, municipality membership/exclusions, point-navigation limits, and the reviewed snapshot date. The snapshot is clearly distinguished from a future published release date.

## Approved bands

The user approved fixed bands below $40k, $40–60k, $60–80k, $80–100k, $100–120k, $120–160k, and $160k+. Lower bounds are inclusive; upper bounds are exclusive. The legend spells out the upper-bound exclusion. The seven bands contain 13, 88, 147, 169, 98, 71, and 13 published DA medians respectively; the five suppressed values stay unavailable.

The authoritative [configuration](../data/income-bands.json) separates classification from presentation and records the income measure, year, currency, and approval date. Browser preparation validates the measure and continuous range coverage. The sequential light-to-dark green/teal palette and neutral unavailable category are documented in [the band decision](adr/0003-fixed-income-bands.md). These thresholds are intended to remain consistent across cities with comparable data.

## Validation and performance

`npm run build` passed source checksums, exact saved-geometry verification for all 604 areas, byte-identical CSV verification, TypeScript checking, and production bundling. All **13 browser checks passed** in Chrome 154. They retain the milestone-two checks and add phone collapse/expand/Escape/focus behaviour, normalized search and directional disambiguation, and exact income-band boundary checks. Automated Axe WCAG 2 A/AA and 2.1 AA checks pass before and after phone selection. Selected desktop and expanded/collapsed phone layouts were visually inspected.

Final production-build measurements use the same milestone-two profile: new browser context, disabled cache, 390×844 touch viewport at scale 3, 150 ms latency, 1.6 Mbps download, 750 Kbps upload, and 4× CPU slowdown on macOS Chrome. Timing runs from navigationStart until index/list/search and all initial-viewport geometry are ready, followed by two animation frames. Street tiles are excluded. A genuine touch selection then verifies DA 12090312 and $50,800.

| Delivery | Initial usability | Subsequent verified selection |
| --- | ---: | ---: |
| Full geometry baseline | 14.013 s | 179 ms |
| Spatial chunks, run 1 | 3.352 s | 96 ms |
| Spatial chunks, run 2 | 3.352 s | 102 ms |
| Spatial chunks, run 3 | 3.350 s | 108 ms |

All three chunked runs pass the provisional five-second target. See [current measurement evidence](../reports/mobile-performance-milestone-three.json); [milestone-two evidence](../reports/mobile-performance.json) remains unchanged. The source geometry and CSV retain their original values and coordinates. No automated check or measurement contacts the OSM tile service.

These local browser-emulation results do not certify physical phones, every browser, full-HRM/rural loading, plain-JSON fallback performance, deployed-host compression, or manual screen-reader accessibility. Those remain release verification items.

## Handoff to milestone four

Verify the release on the agreed browser/device and screen-reader combinations, check deployed-host performance and GitHub Pages limits/cost assumptions, add a repeatable reviewed release workflow, and publish the map and CSV together with an actual release date and data/build identification. The current local preview remains clearly marked as unpublished. Future boundary navigation and aliases require additional reviewed evidence; they do not block the documented initial point-navigation approach.
