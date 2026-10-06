# Development Plan

## Development status

Milestone one has been implemented and validated against official source snapshots retrieved October 6, 2026. See [milestone-one findings](docs/milestone-one.md) and [run instructions](README.md). The dataset contains all 604 dissemination areas belonging to the 2021 Halifax municipal census subdivision: 599 published income medians and five confidentiality-suppressed values. Six independent official API sample comparisons passed.

Community/place-source feasibility has been assessed. Boundary consultation caveats, duplicate place representations, and one uncontained place point require explicit handling before final public search. Fixed dollar bands were approved October 6, 2026; see [band decision](docs/adr/0003-fixed-income-bands.md). Milestone two is implemented: a local TypeScript/Leaflet map, selection details, accessible paginated area list, and original CSV download use the reviewed dataset. Lossless spatial chunks reached initial usability in 3.34–3.35 seconds in three cold-cache mobile-emulation runs (five-second target); full geometry took 14.05 seconds. Ten browser checks passed. See [milestone-two findings](docs/milestone-two.md) for the measurement profile and limits. Milestone three completes resident workflows, including directional place disambiguation, the documented point-navigation fallback, approved bands, and collapsible mobile details. See [milestone-three findings](docs/milestone-three.md). Physical-device/manual accessibility verification and deployment remain for milestone four.

## Agreed product purpose

Build a public information map for residents comparing household income across Halifax Regional Municipality (HRM), with clear data dates and sources. The same purpose may later extend to other Canadian cities.

## Agreed geographic coverage

The first map covers all of HRM, including urban and rural communities, using its 2021 census boundary and matching 2021 dissemination areas. Document the geography vintage. The municipal boundary defines inclusion; the census metropolitan area must not be assumed to be equivalent. Verify official HRM identifiers and geographic membership during data preparation. Use complete dissemination areas rather than clipping them and assigning full-area income to partial areas.

## Agreed mapping units

Use Statistics Canada dissemination areas (DAs) as the coloured units. Community names provide orientation rather than define income reporting units. Do not interpolate census income onto community boundaries for this release.

## Agreed income measure and dates

Show reported **median before-tax total household income in 2020**, from the **2021 Census**. Label the measure and both dates clearly. Do not apply wage-growth projections or inflation adjustments in the first release. Secondary income views have not been agreed.

## Agreed unavailable-data treatment

Areas without a published income figure remain visible and selectable with a neutral fill outside the income colour scale. Show the source reason when available, distinguishing suppressed data from other unavailable values. Never substitute zero or estimate income from nearby areas.

For published income values carrying a source quality warning, display the value where source guidance permits use, retain its income colour, and show a visible caution in the area list and details with a plain-language explanation of the source flag. Suppressed or source-designated unusable values use the unavailable-data appearance. Milestone one must verify the actual flags and their interpretation; do not invent flag meanings or treat every area-level flag as an income-specific warning.

## Agreed colour classification

Use fixed dollar ranges rather than city-specific ranks or quantiles. Choose thresholds after inspecting the income data. For future city comparisons using the same measure and income reference year, use the same thresholds so that a colour has the same meaning. The exact thresholds and palette remain undecided.

## Agreed area details

Selecting a dissemination area opens a details panel showing:

- Reported median before-tax total household income, or the unavailable-data explanation.
- "2020 income · 2021 Census."
- Dissemination area identifier.
- Source link and any relevant data-quality notice.
- A brief explanation that the statistic describes households across the area, not an individual home.

## Agreed search scope

Include community/place-name search in the first release. Choosing a result moves the map to that location; income remains attached to dissemination areas, not the search result or the whole named community. Full street-address search is deferred. Keep searches scoped to HRM. When multiple places match, display labelled results with enough verified location context to distinguish them and require the resident to choose, rather than silently opening the first match. Include verified aliases for alternate names. The reviewed source is 2021 GeoSuite: 364 HRM place points, with no verified aliases in the source inventory. Case, accent, punctuation, and whitespace variations are normalized; unsupported neighbourhood names get an explicit no-results explanation.

## Agreed opening view

Open on urban Halifax–Dartmouth and provide a prominent "Show all HRM" control that fits the full municipality. Clearly state that coverage includes all of HRM. Rural communities remain reachable through search and the full-extent control. Exact opening bounds remain to be chosen during implementation.

## Agreed mobile experience

The first release supports full use on phones: community/place-name search, an accessible legend, tap selection of dissemination areas, and area details in a collapsible bottom panel. Essential information must not depend on hover. Search, legend, and map controls must remain usable alongside the details panel.

## Agreed accessible area list

Include a keyboard- and screen-reader-accessible list of dissemination areas alongside the map. It provides the same reported income figures, dates, unavailable-data explanations, and source links as the map. Selecting an entry opens its area details.

When reliable community boundaries exist, community search narrows the list to dissemination areas intersecting the selected boundary. Label the result explicitly, for example "Census areas intersecting Bedford." Retain each area's own income figure, including where it extends beyond the community. Community boundaries support navigation only; do not calculate a community-wide median. Boundary sources remain undecided.

For a place without a reliable boundary, locate its map point and identify the dissemination area containing that point. Label it "Census area containing this place location" and explain that it does not represent the entire community. Keep the full accessible area list available. Do not invent a community boundary or use an arbitrary search radius. Points outside mapped coverage or without a unique containing area are located with an explicit explanation and no assigned income. The initial release uses this point fallback for all reviewed place records because per-feature civic-boundary finality is not certified. See [navigation decision](docs/adr/0002-place-point-navigation.md).

## Agreed interpretation note

Include a short note in the legend and area details: "Household totals are not adjusted for household size, taxes, or living costs." Explain that the mapped statistic is not individual income or a measure of affordability. Retain the agreed median before-tax total household income measure.

## Agreed data download

Provide a downloadable CSV in the first release containing the income dataset behind the map: dissemination area identifiers, reported median before-tax total household income, availability status, source data-quality flags where applicable, income reference year, census year, geography vintage, and source information. Unavailable income remains blank with an explicit status rather than zero. The CSV and map must use the same release of the data.

## Agreed launch and expansion scope

Launch with HRM only. Make data preparation and the map reusable across cities, supplying each city's boundary, census areas, and place-name data separately. Keep income measures, reference years, and income bands consistent for comparable city releases. Build and validate HRM first; add and validate a second city before introducing a public city selector. Multiple cities are not a first-release requirement.

## Agreed public access

The first release is freely accessible without sign-in. Residents can search places, inspect areas, use the accessible list, and download the CSV without an account. Accounts, saved searches, and user-submitted data are outside first-release scope.

## Agreed architecture

Use a static website with income and place-search data prepared before deployment. The browser handles map selection, search, the accessible area list, and CSV downloads from a reviewed data release. Data preparation runs separately when creating a release. No live application database or per-visit application server is required. GitHub Pages hosting and OpenStreetMap basemap delivery are selected below; deployment limits and fallback behaviour still require verification against the $0/month target. See [architecture decision](docs/adr/0001-static-site-with-reviewed-data.md).

## Agreed operating-cost target

Target $0/month in recurring operating costs for the initial launch, excluding a domain name. Verify hosting, basemap delivery, and any external services against current usage limits and terms before launch. Prefer a design that avoids required paid services and does not silently incur usage charges. No paid fallback has been selected.

## Agreed data maintenance

Publish data updates as reviewed releases, rather than automatically changing the live map. Use a repeatable process to fetch and validate inputs, review the results, and publish the map and CSV together with a visible release date. Preserve income reference year, census year, and geography vintage separately from release date. A new census requires review of variables, geography, and comparability before replacing the current dataset.

## Agreed first development milestone

Before building the public interface, produce a reproducible HRM dataset and a validation report covering:

- Official HRM geographic membership and coverage.
- The exact median before-tax total household income variable and source flags.
- Missing, suppressed, duplicate, and unmatched records, with unexplained join failures resolved before acceptance.
- Sample income values checked against published census profiles.
- Availability and suitability of community boundaries and place locations.

Inspect the reported income distribution to propose fixed income-band thresholds. Assess completeness against the expected set of geographic areas; legitimate source suppression is not a failed join and must remain explicit. Findings requiring a change to agreed coverage or methodology return to review before interface implementation.

## Agreed value formatting

Preserve published dollar values in area details and the CSV without additional rounding to $500. Display dollar amounts with a dollar sign and thousands separators, and explicitly identify them as Canadian dollars. Assign income bands using the reported value, not a separately rounded display value. Compact legend labels such as "$60k–$80k" are permitted, but exact band inclusion rules must be unambiguous. Do not add decimal precision absent from the source.

## Agreed repository and hosting

Use a public GitHub repository and GitHub Pages for the initial static-site hosting target. Repository creation and deployment are later implementation steps. Verify the built site's size, bandwidth expectations, deployment workflow, and current Pages limits before launch. Keep large raw census downloads out of the published site. GitHub Pages does not supply a basemap service; use the separately agreed basemap approach below.

References: [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages) and [usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Agreed basemap delivery

Use OpenStreetMap standard raster tiles for modest interactive viewing at initial launch, accepting best-effort availability. Follow the current tile policy, including visible attribution, normal browser caching, and valid referrer behaviour; do not bulk-fetch tiles or offer offline tile downloads. Keep basemap configuration replaceable and reassess delivery if traffic grows.

Income polygons, locally stored place labels, search, area details, the accessible list, and CSV download must remain usable if external tiles fail. Provide an understandable fallback state without hiding the income data. Verify the behaviour with tile requests blocked before launch.

Reference: [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

## Agreed provisional performance target

Target usable local search and income-area selection within five seconds on a typical phone over a simulated mobile connection, using a named device or browser profile and a cold cache. Specify device/profile, network throttling, dataset release, and measurement start/end conditions before acceptance testing. External street tiles may finish later. If the dataset misses the target, optimise geometry or loading while preserving area identifiers, income values, and accurate selection. Record results; this is a provisional target to validate against the real dataset.

## Agreed implementation stack

Use Python with GeoPandas for reproducible data preparation and spatial operations. Use TypeScript with Vite and Leaflet for the static browser application. Start by evaluating GeoJSON delivery against the validated HRM geometry and provisional mobile performance target before finalising the delivery format. Pin supported dependency versions during implementation. Keep income data and city configuration separate from presentation code.

References: [GeoPandas data joins](https://geopandas.org/en/stable/docs/user_guide/mergingdata.html), [Leaflet choropleth example](https://leafletjs.com/examples/choropleth/), and [Vite guide](https://vite.dev/guide/).

## Agreed language scope

Launch with English interface and explanatory content. Organise interface text for future French translation without requiring bilingual content at launch. Preserve verified official place-name spellings. Future language expansion must include legends, data-quality explanations, search guidance, and accessible content.

## Proposed data pipeline — details still under review

1. Obtain the 2021 Census Profile DA data, matching 2021 DA boundaries, the 2021 HRM census boundary, and official DA-to-municipality relationships.
2. Verify the exact income variable, geographic identifiers, source metadata, and data-quality flags against Statistics Canada documentation.
3. Select the DAs belonging to the agreed coverage and join income records to their boundaries by geographic identifier.
4. Preserve reported values and source flags. Apply the agreed unavailable-data treatment and value formatting. Investigate geographic membership or boundary inconsistencies before release.
5. Produce a map dataset with source references, income reference year, census year, and geography vintage.
6. Build the agreed public map and accessible area list; approved fixed income bands and sequential palette are documented in [the band decision](docs/adr/0003-fixed-income-bands.md).

Source starting point: [Statistics Canada 2021 Census Profile downloads](https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/download-telecharger.cfm?Lang=E).

## Agreed launch acceptance criteria

Before publication, verify and record that:

- Data validation resolves unexplained missing, duplicate, and unmatched records; source suppression remains explicit.
- The map, details panel, accessible list, and CSV agree on values and availability statuses.
- Urban and rural search scenarios work, including ambiguous names and places without reliable community boundaries.
- Phone, keyboard, and screen-reader workflows are verified.
- Income information, local search, the accessible list, and downloads remain usable with external basemap requests blocked.
- The provisional five-second usability target is measured under documented conditions.
- Source attribution and deployment meet the agreed $0/month operating target.

Failed checks require a fix or explicit review of a change to the plan before publication. The data milestone report and launch verification results are release evidence.

## Development sequence

1. **Validate HRM data:** complete the agreed first milestone, recording sources, geography membership, flags, join checks, sample comparisons, and search-data availability. Identify unresolved coverage or licensing issues before interface development.
2. **Prove the complete interaction:** connect the reviewed dataset to a minimal map, selection details, accessible area list, and CSV. Measure initial loading and geometry selection on the chosen mobile profile before expanding the interface.
3. **Complete resident workflows:** implement place search and its boundary/point behaviour, ambiguous-result selection, mobile panels, full-HRM control, legend, quality notices, interpretation notes, and basemap fallback. Choose and document income-band thresholds after inspecting the data.
4. **Verify and release:** complete the launch checks, document the repeatable data/build/deployment process, and prepare the reviewed GitHub Pages release.
5. **Validate expansion after launch:** apply the same measure, year, bands, and data contract to a second city before introducing a city selector.

## Outstanding implementation verification and deferred decisions

- Verify actual source quality flags and implement the agreed caution/unavailable treatment.
- Verify municipal membership and coverage, including separately enumerated census subdivisions within the surrounding geographic footprint.
- Approved income-band thresholds and palette are implemented; verify their interpretation in manual release checks.
- Point navigation and distinguishing location context are implemented. Future aliases and boundary navigation require reviewed supporting evidence.
- Specify the sample-check set, screen-reader/browser combinations, mobile measurement profile, and exact performance timing conditions.
- Validate selected stack, delivery format, GitHub Pages limits, and basemap fallback against the agreed performance and cost targets.
- Validate reuse with a second city after the HRM release; the city and timing remain undecided.

## Superseded proposal

The original proposal used average income, community-boundary interpolation, wage-growth adjustment to 2026, and rounding to $500. The agreed first release instead uses reported median before-tax income on dissemination areas without adjustment to a later year or additional rounding. The original unverified Halifax geographic code and tract count are not implementation inputs.
