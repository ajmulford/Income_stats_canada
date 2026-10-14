# Google Analytics

The app loads Google tag `G-PYZBW9R664` on `income-stats.devedge.biz` and the production workers.dev hostname. Local previews do not load the tag. Google signals and advertising personalization signals are disabled. Analytics is optional to application operation; blockers can prevent collection.

| Event | Parameters | Trigger |
| --- | --- | --- |
| `map_ready` | — | Initial income map is usable |
| `area_search` | `search_kind`, `result_count` | Search settles for 700 ms, loses focus, or precedes selection |
| `search_clear` | `search_kind`, `result_count` | Search is cleared |
| `area_select` | `area_id`, `selection_source`, `income_available` | Area selected from map, list, or search results |
| `map_pan` | `zoom_level` | User finishes dragging |
| `map_zoom` | `zoom_level` | Zoom completes, including navigation to a selection |
| `map_view_change` | `view_name` | Municipality or urban view clicked |
| `map_overlay_change` | `visible` | Income overlay toggled |
| `map_opacity_change` | `opacity_percent` | Opacity adjustment committed |
| `list_sort` | `sort_column`, `sort_direction` | Sort changed |
| `list_page_change` | `page_number`, `direction` | List page changed |
| `csv_download` | `file_name` | CSV download link clicked (does not certify completion) |

Search events never include raw typed text. Area identifiers refer to public census polygons; map events do not include coordinates. Initial page-location reporting omits query strings and fragments. Disable automatic site-search collection in the GA4 web stream's Enhanced measurement settings to retain this search policy if URL-based search is added later. Automatic file-download collection may also report `file_download`; use `csv_download` consistently for this app.

In GA4, use Realtime or DebugView to verify events after deployment. Under Admin → Custom definitions, create event-scoped dimensions for `selection_source`, `search_kind`, `area_id`, `view_name`, `sort_column`, and `sort_direction` as needed; use numeric custom metrics for `result_count` or `zoom_level` if needed. Area identifiers can create high-cardinality reports, so register only dimensions you will use.

Use Explore → Path exploration with Event name as the node type to follow sequences such as `map_ready → area_search → area_select → csv_download`. Event paths describe interaction sequences rather than continuous pointer movement or screen recordings. Use a funnel exploration to compare search-to-selection or selection-to-download completion.

References: [Google event setup](https://developers.google.com/analytics/devguides/collection/ga4/events), [GA4 Path exploration](https://support.google.com/analytics/answer/9317498).
