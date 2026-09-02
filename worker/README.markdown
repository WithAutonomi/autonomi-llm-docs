# Autonomi Markdown Proxy Worker

This directory contains source-controlled Cloudflare Worker code and deployment configuration for the existing production Worker `autonomi-md-proxy`.

## Production configuration

- Worker name: `autonomi-md-proxy`
- Production route: `autonomi.com/*`
- Zone: `autonomi.com`
- Compatibility date: `2025-12-09`
- `workers_dev`: disabled for production
- Connected bindings: none
- Observability: logs enabled with 100% sampling; traces disabled in the confirmed production inventory
- Source-controlled behaviour: serve the staged public `.md`, `/llms.txt`, and `/llms-full.txt` set as Cloudflare Static Assets, excluding internal prefixes `/worker/` and `/.github/`, and fall back to Framer for misses and all other paths

## Local setup

Use Node.js 22 or newer.

```sh
cd worker
npm ci
npm run check
```

`npm run check` performs formatting, JavaScript syntax, runtime tests, config assertions, and Wrangler dry-run validation for both preview and production configs. It does not deploy.

## Serving policy

The public serving policy follows ADR-0006:

- `.md` files outside internal prefixes are staged from one exact Git commit and served as Static Assets.
- `/llms.txt` and `/llms-full.txt` are staged and served the same way.
- `GET` and bodyless `HEAD` requests for matching assets serve exact staged bytes. Other methods routed to a matching asset return `405 Method Not Allowed`.
- `/worker/` and `/.github/` are internal prefixes and are not staged.
- Requests without a matching asset invoke the Worker once and fall through unchanged to Framer. There is no runtime GitHub request.

Keep operational documentation under internal prefixes or use a non-served extension. This runbook uses `.markdown` so it cannot be exposed by older deployed Worker versions that predate the `/worker/` exclusion rule.

## GitHub secrets

All deploy steps use these exact secret names:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The Cloudflare API token should be scoped only as broadly as needed for this Worker, including Workers script edit access and route access for the `autonomi.com` zone.

Because this token can update production Cloudflare resources, the manual preview and production workflows use the GitHub `production` environment approval gate before they can access the token. The workflow files reference that environment, but the environment's required reviewers, admin bypass, and self-review settings are GitHub repository settings outside this source tree. Operators must confirm those settings before the first deploy.

Automatic publication does not use that protected environment because content-only merges are intended to publish without a manual approval. Its credentials must not be made available until the attended activation described below. Secrets are exposed only to each workflow's final deploy step; no committed `.env` is used.

## Preview deploy

Preview deploys are manual only and run only from the `main` branch. They use the GitHub `production` environment approval gate because they use the same Cloudflare account credentials as production deploys.

From GitHub Actions:

1. Open the repository's **Actions** tab.
2. Select **Deploy Worker Preview**.
3. Click **Run workflow** and run it from `main`.
4. When GitHub shows **Review deployments** for the `production` environment, approve it. Preview deploys currently need this approval because they use the same Cloudflare credentials as production, even though the preview Worker deploys only to workers.dev and does not attach the production route.
5. Wait for the workflow to complete.
6. Open the workflow run, open the **Deploy preview Worker** job, expand the final **Deploy preview Worker** step, and copy the workers.dev URL printed by Wrangler. It should look like `https://autonomi-md-proxy-preview.<cloudflare-workers-subdomain>.workers.dev`.

Locally, with Cloudflare credentials exported:

```sh
cd worker
SOURCE_COMMIT="$(git rev-parse HEAD)"
npm run stage:assets -- "$SOURCE_COMMIT"
npm run check
npm run deploy:preview
```

The workflow stages the complete public set from the exact selected `main` commit before checks and deployment. It uses `wrangler.preview.jsonc`, deploys Worker name `autonomi-md-proxy-preview`, enables `workers_dev`, and does not attach a production route. Preview has its own non-cancelling concurrency group and is isolated from production writes.

## Production deploy

The protected manual production workflow runs only from the `main` branch. Use it for serving-machinery changes and to establish a reviewed baseline for later content-only automatic publication.

From GitHub Actions:

1. Open the repository's **Actions** tab.
2. Select **Deploy Worker Production**.
3. Click **Run workflow** and run it from `main`.
4. When GitHub shows **Review deployments** for the `production` environment, approve it.
5. Wait for the workflow to complete.
6. Run the production smoke tests below against the routed `autonomi.com` URLs.

The job uses the GitHub `production` environment, so configure and confirm required reviewers/protection there before use. Use this protected workflow rather than a local production deploy so every repository-driven production write stays in the shared concurrency group.

The workflow stages the complete public set from the exact selected commit, runs the checks, and uses pinned ordinary `wrangler deploy` with `wrangler.jsonc`. It deploys Worker name `autonomi-md-proxy` to route `autonomi.com/*`. The Cloudflare version message records `Protected manual baseline commit <SHA>` so the reviewed baseline remains visible in native deployment history.

The manual workflow and automatic publication share the non-cancelling `autonomi-worker-production` concurrency group. The deploy script asserts the production Worker name and route before deployment.

## Automatic content publication

`Publish Documentation Assets Production` responds to every push to `main`, without path filters, but its job is inert unless the repository variable `AUTOMATIC_PRODUCTION_PUBLICATION` is exactly `enabled`. Do not create or change that variable, the baseline variable, or automatic credentials until the attended Slice 5 activation.

Before activation, an owner must use the protected manual production workflow, verify the live result, and capture its exact commit from Git and the Cloudflare version message. Set the native repository variable `PRODUCTION_BASELINE_SHA` to that full lowercase commit identity only as part of the separately authorized activation. This variable is the guard input, not a substitute audit record; Git and Cloudflare deployment history remain the records.

For an enabled run, the workflow:

1. checks out and stages the complete public set from the exact push SHA;
2. runs the normal checks and dry-runs;
3. refreshes network-current `main` and requires it to equal both checked-out `HEAD` and the push SHA;
4. requires the baseline to be an exact available ancestor and `worker/**`, `.github/workflows/**`, and `.github/actions/**` to be identical at baseline and current `main`;
5. restages the exact push SHA, then uses pinned ordinary `wrangler deploy` with the production config.

Missing or invalid activation skips the job. A missing, invalid, stale, non-ancestor, or machinery-drifted baseline fails before the deploy step and before Cloudflare secrets are exposed. Serving-machinery changes must use the protected manual path and a later attended baseline reconciliation.

## Smoke tests

After a preview deploy, set `PREVIEW_URL` to the workers.dev URL copied from the **Deploy preview Worker** step log:

```sh
PREVIEW_URL="https://autonomi-md-proxy-preview.<cloudflare-workers-subdomain>.workers.dev"

curl -i "$PREVIEW_URL/llms.txt"
curl -i "$PREVIEW_URL/llms-full.txt"
curl -i "$PREVIEW_URL/overview.md"
curl -i "$PREVIEW_URL/worker/README.md"
curl -i "$PREVIEW_URL/missing.md"
curl -i "$PREVIEW_URL/"
```

Preview smoke tests validate asset paths and non-asset behaviour: staged public documentation paths should serve exact repository bytes, while internal-prefix paths, missing Markdown/LLM paths, and non-matching paths should not serve an asset. The preview Worker is not attached to the production `autonomi.com/*` route, so its workers.dev URL cannot validate that fallthrough reaches Framer.

After a production deploy or rollback, use the routed `autonomi.com` URLs to validate both Static Assets and Framer fallthrough:

```sh
curl -i https://autonomi.com/llms.txt
curl -i https://autonomi.com/llms-full.txt
curl -i https://autonomi.com/overview.md
curl -i https://autonomi.com/worker/README.md
curl -i https://autonomi.com/missing.md
curl -i https://autonomi.com/
```

Expected production/route results:

- `/llms.txt` and `/llms-full.txt` return their exact staged bytes with `Content-Type: text/plain; charset=utf-8` and `Cache-Control: public, max-age=300`.
- `.md` paths return their exact staged bytes with `Content-Type: text/markdown; charset=utf-8` and `Cache-Control: public, max-age=300`.
- Internal-prefix paths such as `/worker/README.md` fall through to Framer rather than serving a repository asset.
- Missing markdown/LLM paths and non-matching paths fall through to Framer unchanged.

## Rollback

Manual rollback checklist:

1. Disable automatic publication and cancel a visible run if needed.
2. Visually confirm that no production publication or deployment run is queued or running.
3. Perform the exact intended Cloudflare deployment rollback for `autonomi-md-proxy`.
4. Run the production smoke tests and verify the rollback.
5. Restore Git as the source of truth with a reviewed revert or forward fix, deploy that repository state through the protected production workflow, reconcile `PRODUCTION_BASELINE_SHA`, and re-enable automatic publication only when production is verified and quiet.

## Manual Cloudflare zone dependency

The Browser Integrity Check exception for `/llms.txt`, `/llms-full.txt`, and `.md` paths is existing Cloudflare zone-level configuration. It is intentionally not managed by this first PR. Keep that exception in place manually and track source-controlling it as a follow-up.
