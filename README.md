# Canadian household income maps

A public income map starting with Halifax Regional Municipality. Milestone one builds and validates the data; the public website is a later milestone.

The agreed measure is **median before-tax total household income in 2020**, from the **2021 Census**, on **2021 dissemination areas** belonging to Halifax census subdivision `1209034`. Figures are Canadian dollars, with no wage projection, inflation adjustment, community interpolation, or additional rounding.

## Run milestone one

Python 3.12 or later is required; this build was verified with Python 3.13.1. Use a virtual environment:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock.txt
.venv/bin/python -m scripts.data_pipeline fetch
.venv/bin/python -m scripts.data_pipeline build
.venv/bin/python -m unittest discover -s tests -v
```

The first fetch needs internet access and downloads roughly 550 MB of official inputs. The Atlantic profile expands to about 2.3 GB, but the builder streams it without extracting the entire CSV. Small selected records are cached for subsequent builds. No account, API key, database, or paid service is required for data preparation.

`fetch` and `build` enforce the SHA-256 snapshots in [data/sources.lock.json](data/sources.lock.json). Existing matching sources are reused; changed sources fail validation instead of silently updating a reviewed dataset. Live municipal data and documentation can change: review any differences before deliberately updating the lock. API sample comparison uses a fixed dataflow version.

```sh
# Verify cached official input checksums without rebuilding.
.venv/bin/python -m scripts.data_pipeline verify
```

## Outputs

The default build produces `data/processed/hrm/`:

| File | Purpose |
| --- | --- |
| `income.csv` | All 604 areas, reported dollar values, explicit statuses, original symbols, geographic flags, years, identifiers, and sources |
| `income.geojson` | Complete unsimplified DA polygons joined one-to-one to the CSV data, in WGS84 |
| `municipality.geojson` | Matching 2021 HRM statistical boundary |
| `communities.geojson` | Snapshot of official current HRM civic-community polygons for navigation assessment |
| `community-intersections.json` | Intersecting census areas per community, with source remarks and unresolved boundary-finality status |
| `places.json` | GeoSuite place points, stable identifiers, original source/type codes, and containing-area results |
| `validation.json` / `validation.md` | Checks, independent samples, income distribution, exclusions, and search-source limitations |
| `artifacts.json` | Checksums and sizes of the generated artifacts |

Raw sources, extraction caches, and generated datasets are ignored by Git. They should not be committed or automatically published. The tracked [milestone report](docs/milestone-one.md) records the reviewed findings and links to the generated validation evidence. The build checks inputs and completes validation in a temporary directory before replacing prior outputs.

For another city, use `--config path/to/city.json --output data/processed/city`. The municipal-selection logic is configurable; the current source bundle is Atlantic-specific. Expansion outside Atlantic Canada requires reviewing and configuring that region's bulk profile source/member and independent sample inputs; nationwide expansion is not already implemented.

## Validation rules

- Select geographic membership from GeoSuite component codes as strings, preserving leading zeroes; do not select by CMA or an approximate map intersection.
- Verify census year, variable label, identifier uniqueness, and all required profile records.
- Read the total-income `SYMBOL` by position: the source repeats that header for other columns.
- Preserve confidentiality suppression as null income with an explicit status. Reject unexplained blanks, contradictory suppression, unknown flags, malformed values, or duplicate rows.
- Interpret the first three geographic-quality digits for the selected 100% measure. Preserve long-form flags without applying their suppression or non-response cautions to short-form income.
- Match DA and municipal boundary identifiers; check validity, interior overlap, complete union coverage, population totals, and per-area population/dwelling counts.
- Compare six bulk income values and flags with separately retrieved official SDMX profiles. Bulk characteristic **243** corresponds to API characteristic **229** in dataflow **1.3**, verified against the API codelist. Numeric API flags are decoded from its metadata.
- Verify the community query against the service count and assess validity, intersections, point containment, and duplicate place names.

## Limits requiring later work

The income GeoJSON is deliberately unsimplified. Mobile delivery and the five-second target have not been measured. Proposed fixed income bands are not approved. Current civic-community boundaries differ in vintage and purpose from census units; HRM warns some await consultation. Place records require curation, disambiguation labels, and verified aliases before becoming the final search index. The public interface, GitHub repository, and deployment have not been created.

## Source attribution

Income and census geography: Statistics Canada, 2021 Census of Population, Census Profile and 2021 GeoSuite/boundary files. Use is subject to the [Statistics Canada Open Licence](https://www.statcan.gc.ca/en/terms-conditions/open-licence). Preserve attribution and identify transformations; do not imply Statistics Canada endorsement.

Community geography: Halifax Regional Municipality. Contains information licensed under the [Open Government Licence—Halifax](https://data-hrm.hub.arcgis.com/pages/open-data-licence). Community polygons are used for navigation assessment, not to derive community income figures.

See [DevelopmentPlan.MD](DevelopmentPlan.MD), [CONTEXT.md](CONTEXT.md), and the [architecture decision](docs/adr/0001-static-site-with-reviewed-data.md) for agreed scope and language.
