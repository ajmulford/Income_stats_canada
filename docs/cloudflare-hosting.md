# Cloudflare Workers hosting

GitHub Actions builds and validates the reviewed data on the existing macOS ARM runner. Cloudflare Workers Static Assets hosts the resulting `dist/`. Generated data remains ignored by Git.

## Why the build runs in GitHub Actions

`npm run build` consumes `data/processed/hrm/`; it does not generate the census dataset. Installing the Python package also does not generate it. The verification job explicitly installs `requirements.lock.txt`, fetches checksum-pinned official sources, runs the Python data pipeline and tests, builds the frontend, audits the release, and tests three browser engines.

The macOS build platform matches the reviewed GDAL/PROJ output. Previous Linux builds passed geography validation but differed in exact reviewed geometry hashes. Each deployment downloads the verified build artifact; it does not rerun the data pipeline on Cloudflare or the Ubuntu publication runner. Caches only accelerate builds and are never required for correctness.

## Current destination

Worker: `income-stats-canada` in DevEdge master account. Production URL: `https://income-stats-canada.aj-mulford.workers.dev/`. On October 14, 2026, Alex confirmed that the Cloudflare-managed Git build integration was disconnected, the `CLOUDFLARE_API_TOKEN` secret was added, and GitHub's Worker name, site URL, account ID, and `cloudflare-workers` environment restricted to `main` match this configuration. Account setup is complete; verification and the first Cloudflare publication remain to be run.

## Configure the existing Worker

1. Disable or disconnect the Worker's Cloudflare-managed Git build integration in its Builds settings. GitHub Actions will be its only publisher. Keeping the managed build active would continue the missing-data failure and could race the reviewed release workflow.
2. Record the actual Worker name. `wrangler.json` defaults to `income-stats-canada`; the workflow overrides this using `CLOUDFLARE_WORKER_NAME` so it targets the chosen existing Worker.
3. Create a Cloudflare API token scoped to the selected account with Account / Workers Scripts / Edit and Account / Account Settings / Read, following Cloudflare's GitHub Actions guide. No DNS edit permission is needed for a workers.dev deployment.
4. Add GitHub repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
5. Add repository variables `CLOUDFLARE_WORKER_NAME` and `CLOUDFLARE_SITE_URL` (the actual HTTPS production URL, such as `https://WORKER.ACCOUNT-SUBDOMAIN.workers.dev/`).
6. Configure the `cloudflare-workers` GitHub environment to allow deployment from `main` only.

Never put API tokens in repository files or chat. Wrangler OAuth login is sufficient for local uploads, but GitHub Actions requires its own API-token secret.

## Publish

Push the reviewed source and dispatch **Reviewed Cloudflare Workers release** (`release.yml`). `publish=false` validates without publication; `publish=true` uploads after verification and exact-candidate release gates pass. Normal pushes and pull requests verify without publishing.

The publication job stamps the actual America/Halifax release date and uploads only `dist/` through the pinned Wrangler dependency. The Worker is static-assets-only; no application server or data-processing Worker is deployed. Missing files return 404 rather than an HTML fallback, preserving failed-data-request behavior. The hosted smoke check verifies HTML, assets, index, and CSV against the release manifest.

For local validation without publication:

```sh
npm run build
npm run audit:release
npm run test:release
npx wrangler deploy --config wrangler.json --dry-run
```

For an authorized local release with complete candidate evidence:

```sh
npm run check:release
RELEASE_DATE=YYYY-MM-DD npm run audit:release
npx wrangler deploy --config wrangler.json --name=ACTUAL_WORKER
SITE_URL=https://ACTUAL_WORKER.ACCOUNT-SUBDOMAIN.workers.dev/ node scripts/smoke-release.mjs
```

Use the actual Halifax publication date. Fresh hosted performance evidence uses `PREVIEW_URL` and `REPORT_PATH=reports/mobile-performance-hosted.json`. Keep the former GitHub Pages site until the Cloudflare destination is verified. Custom-domain routing is a separate configuration step after the initial upload.

References: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/get-started/) and [Cloudflare GitHub Actions deployment](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).
