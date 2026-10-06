# Milestone one: HRM data validation

Milestone one implements the repeatable data pipeline and validates an official-source snapshot retrieved on **October 6, 2026**. It establishes a usable data foundation for milestone two; it does not publish a website or certify the final search interface.

## Verified income dataset

| Check | Result |
| --- | --- |
| Municipality | Halifax, Regional municipality; CSD `1209034`, DGUID `2021A00051209034` |
| Geographic units | 604 complete 2021 dissemination areas belonging to that CSD |
| Income measure | Median before-tax total household income in 2020; 2021 Census, 100% data |
| Published / suppressed | 599 published medians; five confidentiality-suppressed values |
| Duplicate / unmatched records | Zero duplicates, unmatched profiles, or unmatched boundaries |
| Population reconciliation | DA populations sum to the municipal population of 439,819 |
| Boundary coverage | DA union matches the municipal statistical boundary; symmetric difference below 1 m² |
| Geometry | All selected DA and municipal geometries valid; interior overlap below 1 m² floating-point tolerance |
| Published income range | CAD $22,600–$224,000 |
| Applicable caution flags | No income-symbol or short-form ≥50% non-response cautions in this snapshot |
| Independent sample checks | Six values/statuses match separately fetched official SDMX census profiles |

Suppressed areas: `12090104`, `12090273`, `12090348`, `12090845`, `12090922`. They remain in both CSV and GeoJSON, with null income and an explicit suppression explanation.

The independent samples cover a Dartmouth location (`12090204`, $75,000), a Sheet Harbour location (`12090591`, $61,200), the minimum and maximum published DA medians (`12090963`, $22,600; `12090294`, $224,000), an additional published area (`12090985`, $98,000), and a suppressed area (`12090104`). These are area statistics, not incomes assigned to the named communities.

Evidence: [generated validation report](../data/processed/hrm/validation.md), [machine-readable validation](../data/processed/hrm/validation.json), and [source snapshot lock](../data/sources.lock.json). Generated datasets are reproducible local artifacts and are ignored by Git; rebuild them using the [README commands](../README.md).

## Source interpretation findings

The original plan's `2021A00051209034` identifies the municipality, not CMA 205. Selection uses the official GeoSuite municipal membership components, preserving leading zeroes. The boundary checks use matching full 2021 statistical files, without cutting areas or redistributing income.

The bulk CSV has repeated `SYMBOL` column names. The parser explicitly reads the symbol adjacent to the total-count income column, rather than allowing a dictionary parser to overwrite it with gender/rate-column symbols.

The geographic-quality flag has separate short-form and long-form components. This median belongs to the 100% household-income data, so the parser applies short-form confidentiality/non-response rules. Long-form warnings and suppression flags remain recorded but do not suppress or label this short-form income as unreliable. Higher non-response below the source's caution threshold remains available as source metadata.

The independent API's characteristic codes differ from the bulk download: **API 229** in **DF_DA version 1.3** describes **bulk characteristic 243**. The builder verifies the measure label against the API codelist and decodes numeric API flags from its flag codelist. It compares values, symbols, and geographic-quality flags for the sample set.

Individual profile HTML pages returned unavailable/404 responses during acquisition. Sample validation therefore uses the official Census Profile SDMX service, rather than treating search-engine snippets as independent verification. Input downloads use Statistics Canada's official `www12-2021` host because the primary host presented an access challenge.

## Explicit coverage exclusions

GeoSuite separately enumerates these census subdivisions in Halifax census division:

- Cole Harbour 30 (`1209019`), population 208.
- Beaver Lake 17 (`1209037`), population 20.
- Sheet Harbour 36 (`1209038`), population 10.
- Wallace Hills 14A (`1209800`), population 15.

They are not members of the agreed Halifax municipal CSD. The dataset does not silently include their areas under HRM, and it does not describe missing municipal membership as income suppression. Future inclusion would be an explicit coverage decision. A future interface must describe coverage precisely enough that geographic holes are understandable.

## Community and place-search feasibility

The official HRM [community dataset](https://www.arcgis.com/home/item.html?id=b4088a068b794436bdb4e5c31df76fe2) is owned by `opendata_HRM` and supplies **200 civic-community boundary features**. The downloaded count matches the service count; all geometries are valid and all intersect one or more selected DAs. Identifiers, source remarks, and intersections are retained.

These represent communities used for civic addressing and emergency services, rather than a complete neighbourhood naming system. North End and South End are not available as named entries in the assessed GeoSuite place inventory. Do not invent boundaries or aliases for them. The [HRM metadata](https://www.halifax.ca/sites/default/files/documents/home/open-data/ODMT_Community_Boundaries.pdf) says some boundaries still require consultation; it does not identify a per-feature finality flag. Consequently, geometric validity alone does not certify every boundary as final. Before enabling boundary-based search, review source remarks and document the reliability treatment; uncertain cases can use the agreed point fallback where a verified point exists.

The municipal snapshot is current, while income reporting units are from 2021. For example, the Beechville source remark describes a 2023 boundary approval. Community geometry is for navigation only, without changing the underlying 2021 income units.

GeoSuite supplies **364 place-point records** assigned to the Halifax CSD. **363** fall in exactly one mapped DA; one Terence Bay record (`036400`) has no containing DA. It remains explicitly unresolved, without snapping it into the nearest area. There is another Terence Bay record, so no name-wide conclusion is drawn from this one point. For the interface, unresolved points must not be assigned a made-up income; retain map navigation and the full area list, or use a separately verified community result.

Fourteen names have multiple GeoSuite records, including Bedford and Dartmouth. Some duplicates represent different source geography types rather than two distinct communities. Records preserve their original source/type codes and point coordinates. Curation must determine whether to consolidate verified representations or distinguish genuinely different locations; adding an arbitrary suffix or picking the first result is not sufficient. No invented aliases have been added.

Sources are suitable inputs for local search, subject to the above curation. The generated inventory and intersections are not yet the final public search index.

## Proposed fixed income bands

The following dollar bands balance readable thresholds with the observed HRM distribution. They are proposals for review during interface development, not approved classification changes. Lower bounds are inclusive and upper bounds exclusive.

| Reported median (CAD) | Areas |
| --- | ---: |
| Below $40,000 | 13 |
| $40,000 to below $60,000 | 88 |
| $60,000 to below $80,000 | 147 |
| $80,000 to below $100,000 | 169 |
| $100,000 to below $120,000 | 98 |
| $120,000 to below $160,000 | 71 |
| $160,000 or more | 13 |
| Unavailable, outside income scale | 5 |

The median of the 599 area medians is $86,000. This is an **unweighted statistic of areas**, not HRM's median household income. A city-wide household median cannot be calculated by averaging or taking the median of DA medians.

## Reproducibility and validation

The pipeline pins source snapshots by SHA-256, checks cache integrity, streams the bulk CSV, and stages outputs before replacing a previous validated build. Income values are unchanged; suppression exports as an empty CSV field and JSON null. CSV and GeoJSON use the same validated records. An artifact manifest records output sizes and hashes. Raw downloads and caches are excluded from Git and website publication.

All **20 regression tests passed**, covering repeated-symbol parsing, short-form versus long-form flags, suppression contradictions, genuine zero values, unknown/malformed inputs, duplicate geography/profile records, income variable/year mismatches, and independent API variable/flag interpretation. Full-dataset checks passed. An export audit confirmed that all 604 CSV and GeoJSON values, availability statuses, flags, dates, and source links agree. A repeat build produced identical hashes for every generated artifact. The independent sample inputs are downloaded separately from the bulk file.

Both Statistics Canada and HRM provide reuse licences; preserve attribution and avoid implying endorsement. The source lock includes the retrieved licence documents. See [Statistics Canada Open Licence](https://www.statcan.gc.ca/en/terms-conditions/open-licence) and [Open Government Licence—Halifax](https://data-hrm.hub.arcgis.com/pages/open-data-licence).

## Handoff to milestone two

The unsimplified income GeoJSON is **8,280,444 bytes (approximately 8.3 MB)**. Rendering, mobile loading time, and the provisional five-second target remain unmeasured. The next milestone should connect these validated records to the minimal map, accessible list, details panel, and CSV, then measure delivery before committing to geometry simplification or another format.

Before completing resident search workflows, resolve the boundary-reliability policy, duplicate representation labels, aliases, and unresolved place points. Before launch, finalise the bands/palette and pass the remaining accessibility, mobile, fallback, attribution, and hosting checks in the development plan. No repository has been published and no website has been deployed.
