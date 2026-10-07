# Manual launch checks and publication

The [development plan](../DevelopmentPlan.MD) requires “Phone, keyboard, and screen-reader workflows are verified” before publication. Browser automation and Axe checks are complete; the following checks require a person using an actual phone and screen reader. Do not mark them passed from emulation or an accessibility scanner.

## Prepare the exact candidate

```sh
npm ci
npm run build
npm run audit:release
npx playwright install chromium firefox webkit
npm run test:browsers
npm run test:release
```

Build the reviewed Python dataset first if `data/processed/hrm/` is absent; follow [README](../README.md). `data/reviewed-release.json` pins the reviewed income/CSV checksums independently of the generated artifact manifest. Changed data requires a reviewed update of that file, source lock, and validation evidence.

For local desktop checks use `npm run preview`. For a physical phone on the same trusted local network, run:

```sh
npx vite preview --host 0.0.0.0 --port 4175
```

Open the printed Network URL on the phone. Stop that LAN preview when finished. The ordinary developer preview binds only to localhost. A downloaded GitHub candidate artifact can instead be served by a static server on your trusted network.

## Physical phone check

Record the actual device, operating system, browser/version, tester, date/time, and findings. A physical iPhone with Safari or Android phone with Chrome is suitable. Test these resident flows:

1. Open the map; confirm the 2020 income / 2021 Census / CAD labels and usable legend without horizontal scrolling.
2. Tap an income polygon. Read its amount and identifier in the bottom panel; collapse/reopen it. Pan/zoom the map and check that map controls remain reachable and attribution visible.
3. Filter the census-area list to `12090312`; select it and confirm **$50,800**. Filter to `12090104`; confirm **Income unavailable** and a confidentiality explanation, never zero.
4. Search **Bedford** and choose a matching census-area row. Search **Sheet Harbour** and verify rural navigation. Confirm the heading count follows the search, clearing restores all areas, and each table column sorts in both directions. Tap place and income cells to verify full-row selection.
5. Use **Show all HRM**, then **Urban view**. Open the official source and download the CSV. Scroll the details panel to reach all notes and its source link.
6. Repeat selection/search with `?basemap=off`; income and place navigation must remain usable. Actual tile-failure recovery is also covered by the automated suite, whose requests are blocked before reaching OSM.

## Screen-reader check

Use an actual screen reader/browser pair, preferably VoiceOver with Safari on macOS/iOS, or TalkBack with Chrome on Android. NVDA with Firefox on Windows is another supported manual-check target. Record the specific combination rather than claiming every screen reader was tested.

1. Navigate headings and use the skip link to reach the census-area list.
2. Find the named census-area filter, enter `12090312`, and activate its result using the screen reader/keyboard. Confirm the selected identifier and **$50,800** are announced and result focus remains usable.
3. Select suppressed `12090104`; confirm unavailable income and its explanation are announced clearly. Check that income is not conveyed solely by colour.
4. Search Bedford, navigate matching table rows, and activate an area. Confirm result status is announced without automatic selection. Activate each column header with Enter/Space and confirm its sort direction is announced. Verify row selection retains keyboard focus.
5. On a phone, navigate collapse/expand and the panel source link. With a desktop keyboard, check Escape when using the phone layout, list pagination, source/download links, and visible focus.

If any step fails, record it and fix the issue before passing the check. Combining the physical-phone and screen-reader checks on the same phone is acceptable if all steps are exercised.

## Record evidence and measure

Copy `candidate_sha256` from [reports/release-candidate.json](../reports/release-candidate.json) into [release/verification.json](../release/verification.json). Fill each applicable entry's environment, tester, ISO date/time, and notes, then set `status` to `passed` only after doing the check. Any built content/data change invalidates the candidate fingerprint and normally requires rechecking that candidate. For the October 6 opacity-only update, Alex explicitly requested publication after the visual adjustment. Prior manual results are carried forward with their original tested candidate recorded in `manual_evidence_disposition`; they do not claim a new physical-device test. Fresh automated browser and performance checks still apply. This documented exception does not cover data, interaction, or accessibility changes.

With production preview running on port 4173, record three cold-cache runs and the full-geometry baseline:

```sh
REPORT_PATH=reports/mobile-performance-milestone-four.json ENFORCE_TARGET=1 npm run measure
npm run check:release
```

The measurement binds its evidence to the candidate fingerprint and source hash; all three chunked runs must meet five seconds. Keep browser tests and other heavy jobs stopped while measuring. The gate checks both the manual evidence and performance for this exact artifact. Commit the completed evidence with the final source; source-identical rebuilds have the same candidate fingerprint because build-commit metadata is excluded from it.

## GitHub setup and release

The intended host is a **public** GitHub repository, using standard macOS/ARM verification runners, Ubuntu deployment runners, and GitHub Pages. The configured remote is the public repository `ajmulford/Income_stats_canada`. Do not infer the publishing account from whichever CLI account happens to be active.

1. Push the reviewed source and evidence to the selected public repository.
2. Pages is configured with **GitHub Actions** as the source, and the `github-pages` environment is restricted to `main`. Keep that default-branch restriction in place.
3. Run **Reviewed GitHub Pages release** with `publish` left false. It rebuilds the pinned inputs, tests three engines, and retains an exact candidate for one day without publishing.
4. Compare that candidate with the locally tested fingerprint. A mismatch blocks publication and needs investigation/reverification. A changed live official source also fails closed; restore the exact reviewed snapshot or review a new source lock. Exact reviewed ancillary responses are bundled in `data/source-snapshots/`; the large census archives still download against their locked hashes. Source caches are an optimization, not durable archival storage.
5. After required checks pass, run the same workflow with `publish` true on the default branch. Publication requires a public repository and exact candidate evidence. It stamps the actual America/Halifax release date, publishes `dist/` only, then checks hosted HTML/assets/index/CSV against the deployed manifest.
6. Open the real project URL, repeat a resident selection and download, and rerun the mobile measurement with `PREVIEW_URL=https://OWNER.github.io/REPOSITORY` and a separate `REPORT_PATH=reports/mobile-performance-hosted.json`. Record response compression and the live result; local preview performance does not certify the host.

If the hosted check or measurement fails, treat the launch as unverified and correct it before announcing the release. Do not silently mark it passed. Record the deployed URL, commit, release date, and hosted verification in the milestone-four report.

## Updates and rollback

For a data update, review the source lock and income variable/geography first, rebuild and validate, update reviewed checksums deliberately, repeat the relevant resident/manual/performance checks, and release map and CSV together. Historical income never becomes a projected current-income value.

For rollback, restore the last reviewed code/data configuration and regenerate its candidate. Reuse manual evidence only if its candidate fingerprint is identical; otherwise reverify. Run the gated release workflow again. The new deployment has its actual publication date and identifies the restored data release; no undocumented mixed map/CSV artifacts should be uploaded.

For the subsequent Ctrl + scroll update, Alex confirmed the behaviour works and explicitly requested deployment. The release record retains the original Pixel/TalkBack evidence transparently and records that confirmation without claiming a new physical-device test. Fresh three-engine interaction tests cover wheel scrolling before/after Ctrl zoom. Mobile touch handlers and accessible list selection are unchanged.

For the mainland overview and overlay-controls update, Alex approved the implemented controls and explicitly requested deployment. Prior device checks are retained with their original candidate provenance; no repeated physical test is claimed. Three-engine automated checks cover all four overview widths, hiding/restoring polygons, opacity adjustment, retained list selection, and accessibility; touch toggle/phone layout were checked in emulation.

For the selection visibility, desktop static details, sorting, and place-suggestion update, Alex confirmed the fixes and explicitly requested deployment. Prior physical evidence retains original provenance; no repeated device test is claimed. Fresh browser and performance evidence applies to the new candidate.

For the place-label and map-click visibility update, Alex reviewed the labels, confirmed the details fix works, and explicitly requested commit and deployment. Original Pixel/TalkBack evidence retains its tested-candidate provenance; no repeated physical-device test is claimed. Fresh three-engine browser checks and candidate-bound mobile measurements apply to this release.

For the merged search and census-table update, Alex reviewed the revisions and explicitly requested commit and deployment. Original Pixel/TalkBack evidence retains its tested-candidate provenance; no repeated physical-device test is claimed. Fresh three-engine browser checks, keyboard sorting, Axe checks, and candidate-bound mobile measurements apply.
