# Household Income Mapping

A public information map for residents comparing household income across Halifax Regional Municipality, with clear data dates and sources. The same purpose may later extend to other Canadian cities.

## Language

**Halifax Regional Municipality (HRM)**:
The municipality defining the first income map's coverage, including its urban and rural communities.
_Avoid_: Halifax when the intended meaning is only the urban core or a census metropolitan area.

**Census subdivision (CSD)**:
A Statistics Canada geographic unit representing a municipality or a municipal equivalent, with Halifax CSD `1209034` defining the first map's coverage.
_Avoid_: Census metropolitan area as a synonym.

**Civic community**:
An HRM community delineated for civic addressing and emergency services, used for map navigation where its boundary is sufficiently reliable.
_Avoid_: Neighbourhood or dissemination area as synonyms.

**Income map**:
A public information map showing geographic differences in household income with explicit data dates and sources.
_Avoid_: Current-income map when the figures describe an earlier year.

**Dissemination area (DA)**:
A Statistics Canada census geographic unit used as a coloured area on the income map.
_Avoid_: Neighbourhood or community as synonyms for a dissemination area.

**Median household income**:
The before-tax total household income value at the midpoint of the reported household income distribution for an area.
_Avoid_: Average household income as a synonym.

**Income reference year**:
The calendar year in which the reported household income was received, which is 2020 for the first release.
_Avoid_: Census year as a synonym.

**Census year**:
The year of the census supplying the income statistics, which is 2021 for the first release.

**Unavailable income**:
An area income figure that the source does not publish or that cannot be reported, with its reason retained when available.
_Avoid_: Zero income or estimated income as substitutes.

**Income band**:
A fixed dollar range used to assign a colour to an area's reported median household income.
_Avoid_: Local rank or percentile as synonyms.

**Place**:
A named community or location within HRM used to find a location on the map.
_Avoid_: Dissemination area as a synonym.

**Data release**:
A reviewed version of the income dataset published together in the map and downloadable CSV.

**Release date**:
The date a data release is published, distinct from its income reference year, census year, and geography vintage.

**Income quality warning**:
A source quality flag applicable to a published income value that calls for caution in its interpretation.

## Relationships

- An **Income map** presents household income comparisons across geographic areas.
- The first **Income map** covers all of **HRM**, including urban and rural communities.
- The first **Income map** uses the 2021 census boundary for **HRM** and matching 2021 **Dissemination areas**; reported income describes whole dissemination areas.
- The first **Income map** includes the 604 **Dissemination areas** belonging to Halifax **Census subdivision** `1209034`; separately enumerated reserve subdivisions in Halifax census division are outside that membership.
- A **Civic community** boundary may intersect multiple **Dissemination areas** and may have a different vintage from the reported census geography.
- The first **Income map** uses **Dissemination areas** as its coloured units.
- The default **Income map** shows **Median household income** for each **Dissemination area** where a reportable value is available.
- **Median household income** is a household-total comparison without adjustment for household size, taxes, or living costs, rather than an individual-income or affordability measure.
- The first **Income map** reports an **Income reference year** of 2020 from **Census year** 2021, without adjustment to a later year.
- A **Dissemination area** with **Unavailable income** remains visible and selectable with a neutral appearance outside the income colour scale.
- Each reportable **Median household income** falls within an **Income band**, with the same thresholds intended for cities compared using the same measure and income reference year.
- Selecting a **Dissemination area** reveals its reported income or unavailable-data explanation, identifier, dates, source, and relevant quality notices; the statistic describes the area's households rather than an individual home.
- Searching for a **Place** locates it on the **Income map** without assigning an income figure to that place as a whole.
- Where a reliable community boundary exists, searching for a **Place** lists intersecting **Dissemination areas**, each retaining its own income figure; intersection does not mean the whole area belongs to that community.
- Without a reliable community boundary, a **Place** is located by a point and its containing **Dissemination area** is identified, without treating that area as the entire community.
- Each **Data release** supplies both the map and CSV and has a visible **Release date**.
- A published **Median household income** with an **Income quality warning** remains displayed where source guidance permits use, with its income colour and a visible explanation in the area list and details.

## Example dialogue

> **Dev:** "What should a resident learn from the income map?"
> **Domain expert:** "How household income compares across Halifax Regional Municipality, and which dates and sources support those comparisons."

## Flagged ambiguities

- The primary purpose is resolved: public information for residents comparing household income; specialised decision-support purposes have not been agreed.
- Geographic extent is resolved: all of HRM; the opening view focuses on urban Halifax–Dartmouth with a prominent "Show all HRM" control. Its overview frames mainland HRM, as approved October 6, 2026; the distant offshore census area remains in the data, list, CSV, and selectable map. Overview framing is distinct from dataset coverage.
- Geography vintage is resolved: matching 2021 municipal and dissemination-area census boundaries.
- Official membership and coverage are verified for the October 6, 2026 source snapshot; the original geographic code identifies the municipal CSD, not CMA 205.
- HRM community polygons represent civic communities, not every commonly used neighbourhood; source metadata warns some boundaries await consultation, so validity does not establish finality.
- Mapped units are resolved: dissemination areas, rather than named community boundaries; community names provide orientation rather than define income reporting units.
- The default income statistic is resolved: median before-tax total household income, rather than average or after-tax income.
- Data timing is resolved: reported 2020 income from the 2021 Census; the first release does not estimate 2026 income or adjust for inflation.
- Unavailable income is resolved: retain the area, explain the source reason when available, and do not substitute zero or a neighbouring area's value.
- Colour classification is resolved: fixed dollar ranges, rather than city-specific ranks; approved 2020 CAD thresholds are $40k, $60k, $80k, $100k, $120k, and $160k, with inclusive lower and exclusive upper bounds.

- Initial navigation uses the reviewed GeoSuite place points because the current civic-community inventory does not certify per-feature boundary finality. Duplicate names remain distinct choices; uncontained points receive no income. See [navigation decision](docs/adr/0002-place-point-navigation.md).
- No verified alternate-name aliases are present in the reviewed place inventory. Typographical normalization supports case, accent, whitespace, and punctuation variations without inventing name equivalences.

- Map presentation controls let residents hide/show the income overlay and choose colour opacity from 0–100% (default 45%). Hiding removes income polygons and their map click targets while retaining census-list selection, income details, and CSV access. The opacity setting is retained when toggling or navigating within the page; refresh restores the default. These controls change presentation only.

- On phone layouts, tapping a census-list result reveals and focuses the map, fits the selected area, and keeps the full map above the expanded bottom details panel. Keyboard activation retains list focus. The earlier map fit alone did not scroll the document, so the map remained off screen; regression checks now assert map/panel viewport geometry at portrait and landscape sizes.

- On desktop layouts, pointer activation of a census-list result reveals the details panel beside the map and focuses its selected-area heading. The sticky map already remained visible; details needed explicit document scrolling after selection. Keyboard activation keeps list focus.

- Desktop area details are always open, with no collapse/expand control. Collapse/expand remains available on phone layouts; switching to desktop reopens previously collapsed details.
