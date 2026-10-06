# Milestone four: verify and release

Status on October 6, 2026: **release implementation and local automated checks are ready; publication remains pending**. The remote points to the public repository `ajmulford/Income_stats_canada`; publication workflows are now included in the reviewed configuration. No hosted CI run or Pages deployment has occurred, and actual physical-phone/screen-reader checks are not recorded. This milestone is not marked complete while those launch criteria remain outstanding.

## Prepared release implementation

- GitHub Actions verifies pinned source snapshots, rebuilds the data, checks the Python pipeline, builds the static site, audits its content, and tests three browser engines. Actions are pinned to official release commits; Node 24.12.0 and Python 3.13.1 are specified.
- Ordinary pushes/pull requests never publish. The manual release workflow defaults to verification only; publication requires the public repository's default branch and the recorded launch checks.
- [Reviewed release configuration](../data/reviewed-release.json) pins the original income and CSV hashes independently of the generated manifest. The browser-data preparation step rejects an unreviewed income release.
- The audit verifies every generated browser artifact, rejects unexpected files/symlinks, checks geography/availability counts and the Pages size limit, and writes [candidate evidence](../reports/release-candidate.json) plus `dist/release.json`.
- The release gate checks manual physical-phone/screen-reader evidence and three passing mobile-emulation runs against the exact candidate fingerprint. Six regression tests cover valid evidence, missing geometry, changed CSV, stale manual evidence, a pending screen-reader check, and stale performance evidence. Fabricated positive evidence exists only in temporary test fixtures; the real verification file remains pending.
- Publication stamps its actual America/Halifax release date after the gate passes. The preview remains explicitly unpublished. Metadata distinguishes source snapshot, income/census years, data identity, candidate/published content hashes, commit, and a dirty local working tree.
- Post-deployment checks compare hosted HTML, application assets, income index, and CSV against the deployed manifest. They support root and project-subdirectory URLs. Hosted performance is measured separately after deployment.
- Basemap settings are replaceable through [data/basemap.json](../data/basemap.json). Attribution and zoom controls sit at the top of the map, away from the phone bottom panel. A valid browser referrer policy, ordinary tile caching, HTTPS OSM URL, viewport-only requests, and failure independence are preserved.
- Viewport loading now exposes an accurate loading state. The full-HRM browser scenario waits until **all 604 areas** have actually loaded, then checks the urban control.

See [publication decision](adr/0004-reviewed-publication.md) and the concrete [manual launch/publication instructions](release-checklist.md). Only `dist/` is uploaded to Pages; raw census archives and development/validation files are excluded.

## Local validation evidence

| Check | Result |
| --- | --- |
| Official cached input checksum verification and fresh data rebuild | Passed; 604 areas, 599 published, five suppressed |
| Python regression checks | 20 passed |
| Production build and exact delivery audit | Passed |
| Resident scenarios | 15 per engine, 45 passed total |
| Engines | Installed Chrome 154, Playwright Firefox 155, Playwright WebKit 26.6 on macOS |
| Automated accessibility | Axe WCAG 2 A/AA and 2.1 AA checks passed before/after phone-layout selection in all three engines |
| Release-gate regression checks | Six passed |
| Workflow syntax | Passed with actionlint 1.7.12; ShellCheck was not run |
| Served artifact/CSV smoke check | Passed on local production preview |
| Physical phone and actual screen reader | Pending |
| Linux GitHub-hosted build and Pages deployment | Pending |
| Hosted compression/performance and real URL verification | Pending |

The browser suite includes source-value map/list agreement, suppression, duplicate/uncontained places, rural Sheet Harbour selection, full-HRM coverage, keyboard/mobile panel interaction, original CSV download, failed tiles/geometry, both gzip transports and plain JSON, exact band edges, and project-subdirectory hosting. All automatic tile requests are intercepted or disabled; no OSM tiles are scraped for tests.

The WebKit checks exercise the engine, not an actual iPhone/Safari/VoiceOver combination. Local artifact verification is not a hosted deployment result. See [machine-readable launch status](../reports/launch-verification.json).

## Performance and hosting assessment

The current [mobile measurement](../reports/mobile-performance-milestone-four.json) is bound to the audited candidate hash. It uses the same cold-cache profile as milestones two/three: 390×844 touch viewport at scale 3, 150 ms latency, 1.6 Mbps download, 750 Kbps upload, 4× CPU slowdown, fresh contexts, and no external tiles. Timing ends after index/list/search and initial-viewport geometry are loaded and two animation frames have elapsed. Every run performs a real touch selection and verifies DA 12090312 at $50,800. The normal runs reached usability in 3.390, 3.381, 3.386 seconds; their median is **3.386 seconds**. All three pass the five-second target. These are local browser-emulation measurements; the live host remains unmeasured.

The site is approximately **20.75 MB**, excluding its small self-describing manifest, below the current **1 GB** Pages site limit. GitHub Pages supports public repositories on GitHub Free and has a **100 GB/month soft bandwidth limit**; the ten-builds/hour limit does not apply to custom Actions workflows. [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

Public repositories using standard GitHub-hosted runners have free Actions execution. Keep the free Pages domain, standard macOS/ARM verification and Ubuntu deployment runners, the default cache cap, and total account artifact storage within its free allowance; paid/larger runners or extra storage are outside the $0/month target. Candidate artifacts are retained only for manual runs and kept for one day; failed traces also expire after one day. Actual account budgets/other repository usage have not been inspected. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Normal full-HRM geometry delivery is about 2.58 MB compressed plus the income/place index and application assets; optional CSV downloads add roughly 173 KB. Bandwidth estimates depend on how much users explore, host compression, caching, and downloads; site size is not the bytes fetched on every visit. Reassess actual traffic against the soft limit after launch. External street tiles use their separate service and do not consume Pages bandwidth.

OSM standard tiles provide best-effort availability without a service guarantee. The implementation uses the prescribed HTTPS URL, visible attribution, normal browser caching/referrers, and interactive viewport requests; it does not offer offline downloads or bulk prefetch. Review the replaceable provider if traffic grows. [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Remaining steps to complete the milestone

1. Run the validation-only workflow on the public `ajmulford/Income_stats_canada` repository and record its result.
2. Perform the physical-phone and actual screen-reader scenarios in [the checklist](release-checklist.md). Complete [release/verification.json](../release/verification.json) with honest device/browser, tester, timestamp, findings, and the exact candidate identity. Resolve any failures and reverify changed content.
3. Verify that the Linux-built candidate matches the locally tested content. Platform/source differences fail closed and require investigation rather than silent approval.
4. Enable GitHub Actions as the Pages source and run the gated publication workflow. Record the actual URL/date/commit and verify the deployed artifact and cold-cache hosted performance before announcing the release.

The user authorized making the repository public and committing/pushing the outstanding release configuration. The user configured the remote and pushed the committed application. This follow-up made the repository public with explicit authorization, using the owner’s existing authentication. The site remains unpublished while manual launch checks are pending.

## First GitHub run and reproducibility fix

The repository was made public and the missing workflow configuration committed/pushed with explicit authorization. Pages uses the Actions build type; its deployment environment permits only `main`. No site artifact was published.

The first Linux run ([37516843867](https://github.com/ajmulford/Income_stats_canada/actions/runs/37516843867)) correctly rejected changed ArcGIS item metadata. Comparison with the reviewed response showed only `lastViewed` and `numViews` differences; the income and boundary archive downloads matched their locks. The SDMX metadata snapshot also contains its response-preparation timestamp. The fix retains exact reviewed ancillary inputs in the 3.1 MB compressed `data/source-snapshots/` bundle and restores them only after original SHA-256 verification. No source lock, income value, geography, or checksum requirement was relaxed. Large census archives remain outside Git and the published site.

The next Linux build passed all census/geography checks and 22 Python tests but failed the exact reviewed-output hash gate. Verification is being checked on standard `macos-26` ARM runners, matching the original native GDAL/PROJ platform; deployment remains on Ubuntu. Output hashes remain unchanged and enforced. Failed-run artifacts retain rebuilt income/geometry for investigation rather than silently accepting different bytes.
