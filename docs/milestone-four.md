# Milestone four: verify and release

Status on October 6, 2026: **complete — published and verified**. [Halifax Income Atlas](https://ajmulford.github.io/Income_stats_canada/) is live. The gated [publication run](https://github.com/ajmulford/Income_stats_canada/actions/runs/37522280672) passed the reviewed-data build, 22 Python tests, seven release tests, 45 browser checks, manual/performance gate, deployment, and hosted artifact checks. Alex confirmed successful Pixel 9 / Chrome / TalkBack checks. All three hosted cold-cache mobile runs passed five seconds.

## Prepared release implementation

- GitHub Actions verifies pinned source snapshots, rebuilds the data, checks the Python pipeline, builds the static site, audits its content, and tests three browser engines. Actions are pinned to official release commits; Node 24.12.0 and Python 3.13.1 are specified.
- Ordinary pushes/pull requests never publish. The manual release workflow defaults to verification only; publication requires the public repository's default branch and the recorded launch checks.
- [Reviewed release configuration](../data/reviewed-release.json) pins the original income and CSV hashes independently of the generated manifest. The browser-data preparation step rejects an unreviewed income release.
- The audit verifies every generated browser artifact, rejects unexpected files/symlinks, checks geography/availability counts and the Pages size limit, and writes [candidate evidence](../reports/release-candidate.json) plus `dist/release.json`.
- The release gate checks manual physical-phone/screen-reader evidence and three passing mobile-emulation runs against the exact candidate fingerprint. Seven regression tests cover valid evidence, missing geometry, changed CSV, stale manual evidence, a pending screen-reader check, stale performance evidence, and publication stamping. Fabricated positive evidence exists only in temporary test fixtures; the real verification file remains pending.
- Publication stamps its actual America/Halifax release date after the gate passes. The preview remains explicitly unpublished. Metadata distinguishes source snapshot, income/census years, data identity, candidate/published content hashes, commit, and a dirty local working tree.
- Post-deployment checks compare hosted HTML, application assets, income index, and CSV against the deployed manifest. They support root and project-subdirectory URLs. Hosted performance is measured separately after deployment.
- Basemap settings are replaceable through [data/basemap.json](../data/basemap.json). Attribution and zoom controls sit at the top of the map, away from the phone bottom panel. A valid browser referrer policy, ordinary tile caching, HTTPS OSM URL, viewport-only requests, and failure independence are preserved.
- Viewport loading now exposes an accurate loading state. The full-HRM browser scenario waits until **all 604 areas** have actually loaded, then checks the urban control.

See [publication decision](adr/0004-reviewed-publication.md) and the concrete [manual launch/publication instructions](release-checklist.md). Only `dist/` is uploaded to Pages; raw census archives and development/validation files are excluded.

## Local validation evidence

| Check | Result |
| --- | --- |
| Official cached input checksum verification and fresh data rebuild | Passed; 604 areas, 599 published, five suppressed |
| Python regression checks | 22 passed |
| Production build and exact delivery audit | Passed |
| Resident scenarios | 15 per engine, 45 passed total |
| Engines | Installed Chrome 154, Playwright Firefox 155, Playwright WebKit 26.6 on macOS |
| Automated accessibility | Axe WCAG 2 A/AA and 2.1 AA checks passed before/after phone-layout selection in all three engines |
| Release-gate regression checks | Seven passed |
| Workflow syntax | Passed with actionlint 1.7.12; ShellCheck was not run |
| Served artifact/CSV smoke check | Passed on local production preview |
| Physical phone and actual screen reader | Passed; Alex reports Pixel 9 / Android / Chrome and TalkBack, October 6; no changes needed |
| GitHub-hosted macOS/ARM verification | Passed; exact local candidate match, 22 Python tests, seven release-gate tests, 45 browser checks |
| Pages deployment | Passed; hosted HTML/assets/index/CSV hashes verified |
| Hosted compression/performance and real URL verification | Passed; gzip income index, all three mobile runs below five seconds |

The browser suite includes source-value map/list agreement, suppression, duplicate/uncontained places, rural Sheet Harbour selection, full-HRM coverage, keyboard/mobile panel interaction, original CSV download, failed tiles/geometry, both gzip transports and plain JSON, exact band edges, and project-subdirectory hosting. All automatic tile requests are intercepted or disabled; no OSM tiles are scraped for tests.

The WebKit checks exercise the engine, not an actual iPhone/Safari/VoiceOver combination. Local artifact verification is not a hosted deployment result. See [machine-readable launch status](../reports/launch-verification.json).

## Performance and hosting assessment

The current [mobile measurement](../reports/mobile-performance-milestone-four.json) is bound to the audited candidate hash. It uses the same cold-cache profile as milestones two/three: 390×844 touch viewport at scale 3, 150 ms latency, 1.6 Mbps download, 750 Kbps upload, 4× CPU slowdown, fresh contexts, and no external tiles. Timing ends after index/list/search and initial-viewport geometry are loaded and two animation frames have elapsed. Every run performs a real touch selection and verifies DA 12090312 at $50,800. The normal runs reached usability in 3.390, 3.381, 3.386 seconds; their median is **3.386 seconds**. All three pass the five-second target. These are local browser-emulation measurements; hosted results are recorded below.

The site is approximately **20.75 MB**, excluding its small self-describing manifest, below the current **1 GB** Pages site limit. GitHub Pages supports public repositories on GitHub Free and has a **100 GB/month soft bandwidth limit**; the ten-builds/hour limit does not apply to custom Actions workflows. [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

Public repositories using standard GitHub-hosted runners have free Actions execution. Keep the free Pages domain, standard macOS/ARM verification and Ubuntu deployment runners, the default cache cap, and total account artifact storage within its free allowance; paid/larger runners or extra storage are outside the $0/month target. Candidate artifacts are retained only for manual runs and kept for one day; failed traces also expire after one day. Actual account budgets/other repository usage have not been inspected. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Normal full-HRM geometry delivery is about 2.58 MB compressed plus the income/place index and application assets; optional CSV downloads add roughly 173 KB. Bandwidth estimates depend on how much users explore, host compression, caching, and downloads; site size is not the bytes fetched on every visit. Reassess actual traffic against the soft limit after launch. External street tiles use their separate service and do not consume Pages bandwidth.

OSM standard tiles provide best-effort availability without a service guarantee. The implementation uses the prescribed HTTPS URL, visible attribution, normal browser caching/referrers, and interactive viewport requests; it does not offer offline downloads or bulk prefetch. Review the replaceable provider if traffic grows. [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Published release

The site was published on October 6, 2026 from commit `2238a37c467a342d69cf1ad41ed408f501e7c4ef`. [Published release evidence](../reports/published-release.json) records candidate `2d53c218c6bd3e44e9bacf46533c6b638e19e6d634b6c744e8674ccb0bb4026b` and published content `427b3b7a2e6a600f21c0321c4e4d669064459f6dfe9801e32495d7d9b43c2e6e`; stamping publication labels accounts for the difference.

[Hosted mobile measurements](../reports/mobile-performance-hosted.json) used the same cold-cache, network, viewport, and CPU profile as local validation. The three chunked runs took 3.458, 3.437, and 3.461 seconds (median **3.458 seconds**), all below five seconds. Each run selected census area 12090312 and verified $50,800. The income index was served with `Content-Encoding: gzip`. GitHub's post-deployment smoke check verified hosted HTML, assets, index, and original CSV against the published manifest. Basemap tiles were disabled during measurement.

## First GitHub run and reproducibility fix

The repository was made public and the missing workflow configuration committed/pushed with explicit authorization. Pages uses the Actions build type; its deployment environment permits only `main`. No site artifact was published.

The first Linux run ([37516843867](https://github.com/ajmulford/Income_stats_canada/actions/runs/37516843867)) correctly rejected changed ArcGIS item metadata. Comparison with the reviewed response showed only `lastViewed` and `numViews` differences; the income and boundary archive downloads matched their locks. The SDMX metadata snapshot also contains its response-preparation timestamp. The fix retains exact reviewed ancillary inputs in the 3.1 MB compressed `data/source-snapshots/` bundle and restores them only after original SHA-256 verification. No source lock, income value, geography, or checksum requirement was relaxed. Large census archives remain outside Git and the published site.

The next Linux build passed all census/geography checks and 22 Python tests but failed the exact reviewed-output hash gate. Verification passed on standard `macos-26` ARM runners, matching the original native GDAL/PROJ platform; deployment remains on Ubuntu. Output hashes remain unchanged and enforced. Failed-run artifacts retain rebuilt income/geometry for investigation rather than silently accepting different bytes.

The successful [GitHub verification run](https://github.com/ajmulford/Income_stats_canada/actions/runs/37518592636) checked commit `ab57c84ff992fadefd5ec49d98334c9db225950e`. Its audited candidate is `2d53c218c6bd3e44e9bacf46533c6b638e19e6d634b6c744e8674ccb0bb4026b`, identical to the local candidate and performance evidence identity. All 45 browser checks passed on the hosted runner.

The [verification-only release run](https://github.com/ajmulford/Income_stats_canada/actions/runs/37519102706) also passed. Publication was disabled. The retained candidate was downloaded and every served file checked against its manifest; its fingerprint matches the local candidate exactly.

## Node 24 action maintenance

The successful first release dry run carried a Node 20 deprecation annotation for cache/artifact actions. Workflow actions were updated to checksum-pinned official Node 24 releases: cache 6.1.0, upload-artifact 7.0.1, download-artifact 8.0.1, configure-pages 6.0.0, upload-pages-artifact 5.0.0, and deploy-pages 5.0.1. The Pages upload composite also uses a Node 24 artifact action. Workflow syntax passed actionlint; the [updated verification-only release run](https://github.com/ajmulford/Income_stats_canada/actions/runs/37520669068) passed all 45 browser checks and retained the identical candidate without the Node 20 deprecation warning. Site content and its candidate fingerprint are unchanged.

The user reports successful physical-phone and screen-reader checks. Alex clarified the tested environment as Pixel 9 / latest Android / Chrome with TalkBack, tested October 6, with no changes needed. [Manual evidence](../release/verification.json) records that report; version numbers and exact clock time were not supplied.

The first publication attempt stopped before deployment because the stamping step expected a release-status span absent from the reviewed preview footer. The fix stamps the existing reviewed footer only during publication, preserving candidate identity. A regression test verifies the date/status labels, retained candidate fingerprint, and changed published-content fingerprint. The corrected publication run passed.

## Street visibility update

The opacity-only update was published from commit `eb406d7f7d69d2a22b4de1db8ade2bfb05348bd0` by [run 37523977893](https://github.com/ajmulford/Income_stats_canada/actions/runs/37523977893). Income shading changed from 83% to 45% opacity so streets and labels show through more clearly. Data, band thresholds, and selection outlines are unchanged. Candidate `72e0f6d027bc4cb686f3867eeadc015e7e47f53514b5a99b90a9c23357a3cf5a` passed 45 local/browser checks, seven release tests, fresh local performance checks, and GitHub verification/deployment/hosted artifact checks.

Alex explicitly requested publication of this visual-only change. Earlier physical-phone/TalkBack checks are carried forward transparently in [verification evidence](../release/verification.json); they were not repeated on the new candidate. The live cold-cache mobile median is **3.490 seconds** and all three runs passed five seconds with successful $50,800 selections. Current [published manifest](../reports/published-release.json) and [hosted performance report](../reports/mobile-performance-hosted.json) describe this update; the earlier release details above remain historical evidence.

## Ctrl + scroll update

[Publication run 37526406044](https://github.com/ajmulford/Income_stats_canada/actions/runs/37526406044) deployed commit `127343545bc8819ed9b05ab5fd15014398efe4bd`. Ordinary wheel scrolling moves the page; holding Ctrl zooms around the cursor. A desktop hint explains the gesture and is hidden on coarse touch devices. Zoom buttons, dragging, and pinch zoom remain available. All 48 browser checks across three engines and seven release checks passed. A separate live-site browser check verified page scrolling before and after Ctrl zoom, plus Ctrl zoom-out, with no OSM tile requests.

Alex confirmed the behaviour works and explicitly requested commit/deployment. The [manual evidence](../release/verification.json) preserves the provenance of the earlier Pixel/TalkBack checks without claiming a repeated physical test. The current candidate is `1ca7026718b9716c40cefb90a96d92848725de8789cb0ed93d2cd11d571b7e4e`. All three hosted cold-cache mobile runs passed, with median **3.393 seconds**. Current machine-readable published/performance evidence describes this release; prior release sections are historical.

## Mainland overview and overlay controls release

[Publication run 37537861647](https://github.com/ajmulford/Income_stats_canada/actions/runs/37537861647) deployed commit `a5fd39047fd442417d23af293801cf944756dca2`. The overview now frames mainland HRM, retaining the offshore area in the list, dataset, and CSV. The map includes a Show income data toggle and a 0–100% colour-opacity slider, initially 45%. Hiding removes polygons and their map interaction; list selection and details remain usable. The chosen opacity survives toggling and navigation within the page.

The production build, 63 checks across three browsers, seven release tests, and GitHub deployment/artifact checks passed. A live browser check verified toggle, opacity, navigation, and hidden-overlay list selection with OSM requests blocked. All three hosted cold-cache mobile runs passed five seconds, with median **3.418 seconds**. Alex explicitly approved deployment; [manual evidence](../release/verification.json) retains earlier device-check provenance without claiming repeated physical tests. Current candidate `60ba0763f41525e6446f7a9571fa9ab8582718f9d901cdd8be0959e40dd531fe` is recorded in the published and performance reports.

## Selection visibility and sorting release

[Publication run 37541396099](https://github.com/ajmulford/Income_stats_canada/actions/runs/37541396099) deployed commit `5c7966064fe67a88f8225b3a025aa1ea25b2364a`. Mobile list taps reveal the selected map above the details panel; desktop pointer selection reveals and focuses the details beside the map. Desktop details stay open without a collapse control. Sorting supports area numbers and income in either direction, with unavailable incomes last. Place suggestions share viewport handling while retaining their place-centred camera, including explanatory details for locations without a containing census area.

The build, 93 browser checks, seven release tests, and GitHub deployment/hosted artifact checks passed. Live desktop/mobile checks verified place-suggestion visibility and uncontained locations with OSM blocked. All three hosted mobile runs passed five seconds, with median **3.434 seconds**. Alex explicitly approved deployment; prior physical-check provenance is retained without claiming repeated device testing. Current candidate `5ca22848313b271f6027f21c53233f6770dab7ef40901276b6d51251f2e456f6` appears in the published and performance reports.


## Merged search and census table update

The shared search filters census areas by identifier, verified contained place names, and approximate nearby labels. The separate place-suggestion dropdown is removed. The heading count follows filtered results. The three table headers sort area, place, and income with arrow indicators and announced directions; unavailable incomes remain last. Clicking any row cell selects its area; keyboard selection retains focus. Area numbers are vertically centered alongside the other cells.

Alex reviewed the revisions and explicitly requested commit and deployment, with notification when the publication workflow is queued. Original Pixel/TalkBack evidence retains its original tested-candidate provenance; no repeated physical-device test is claimed. Local verification covered 108 browser scenarios across three engines. Safari's click-focus assumption was corrected to keyboard activation and that check passed in all three engines. Seven release-gate tests passed. Candidate-bound mobile results are recorded in reports/mobile-performance-milestone-four.json. Hosted verification runs in the publication workflow; this record does not claim deployment completion or fresh hosted measurements.
