# Frame mainland HRM in the overview

Approved October 6, 2026. “Show all HRM” frames mainland HRM. Distant offshore census area `12090845` remains in all census data, the list, CSV, and its selectable geometry. A visible map note explains this distinction.

The earlier control fitted the dataset's full bounds, whose eastern offshore extent moved the centre into the ocean. A minimum zoom of 8 also clipped those bounds on narrow maps: on a 390-pixel viewport only 239 areas loaded after choosing the overview. Allowing zoom 6 fixed clipping but retained the offshore centre. The user therefore chose mainland framing across every viewport.

`data/map-view.json` identifies the area omitted from overview framing only. Browser preparation computes separate `overviewBounds` from the complete original polygons; `bounds` still describes all 604 areas. No income, geography, or CSV is removed or changed. Overview configuration rejects unknown identifiers. Wheel zoom respects the map's configured limits.

Regression checks exercise overview map selection and retained offshore-area navigation at widths 390, 768, 1280, and 1920, alongside the original urban/municipal controls. Testing only the total loaded-area count had missed the off-centre camera; the new checks exercise a mainland map click as well as dataset retention.
