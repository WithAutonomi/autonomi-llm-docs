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
- Source-controlled behaviour: serve public `.md`, `/llms.txt`, and `/llms-full.txt` paths from `WithAutonomi/autonomi-llm-docs` on GitHub, excluding internal prefixes `/worker/` and `/.github/`, and falling back to Framer for misses and all other paths

## Local setup

Use Node.js 22 or newer.

```sh
cd worker
npm ci
npm run check
```

`npm run check` performs formatting, JavaScript syntax, runtime tests, config assertions, and Wrangler dry-run validation for both preview and production configs. It does not deploy.

## GitHub fallback telemetry

For each GitHub Raw non-OK response or thrown fetch error, the Worker makes one best-effort attempt to pass a plain object to `console.warn` or `console.error` before falling through to Framer. Cloudflare can extract the object's top-level keys as structured log fields; receipt and storage depend on logger availability and Cloudflare sampling and limits. Open the logs for the `autonomi-md-proxy` Worker and filter or group by fields such as `event` and `status`.

The production Worker makes these telemetry attempts only after the changed Worker SHA is deployed through the manual **Deploy Worker Production** workflow; merging alone does not deploy Worker code.

- `github_raw_non_ok` is attempted at warning level for a non-OK GitHub response.
- `github_raw_fetch_error` is attempted at error level when the GitHub fetch throws.

Routine missing `.md` probes trigger the same best-effort `github_raw_non_ok` attempt. With the current configured 100% sampling, attempted 404 volume is request-proportional. Operators should group or filter by `status` and revisit the log level or sampling if routine 404s dominate the incident signal or log allowance or cost becomes material.

The object schemas are:

```json
{
  "event": "github_raw_non_ok",
  "pathname": "/example.md",
  "status": 429,
  "retry_after": "120",
  "rate_limit_remaining": "0",
  "github_request_id": "ABC:123"
}
```

The three diagnostic header fields are strings when GitHub supplies them and `null` when absent.

```json
{
  "event": "github_raw_fetch_error",
  "pathname": "/example.md",
  "error_name": "TypeError",
  "error_message": "fetch failed"
}
```

Telemetry construction reads and copies only the allowlisted fields shown above. The code does not read or copy query values, request or response bodies, incoming request headers, bindings or secrets, or stacks into telemetry. Permitted pathname, diagnostic, and error name/message strings are not content-redacted. Telemetry attempts do not change fallback behaviour: non-OK responses and fetch exceptions still fall through to Framer unchanged.

## Serving policy

The public serving policy follows ADR-0006:

- `.md` files outside internal prefixes are served from GitHub raw content.
- `/llms.txt` and `/llms-full.txt` are served from GitHub raw content.
- Only GET and HEAD requests are served from GitHub raw content; other HTTP methods fall through unchanged.
- `/worker/` and `/.github/` are internal prefixes and fall through to Framer rather than being served from GitHub raw content.

Keep operational documentation under internal prefixes or use a non-served extension. This runbook uses `.markdown` so it cannot be exposed by older deployed Worker versions that predate the `/worker/` exclusion rule.

## GitHub secrets

Manual deploy workflows require these repository, organization, or `production` environment secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The Cloudflare API token should be scoped only as broadly as needed for this Worker, including Workers script edit access and route access for the `autonomi.com` zone.

Because this token can update production Cloudflare resources, both deploy workflows use the GitHub `production` environment approval gate before they can access the token. The workflow files reference that environment, but the environment's required reviewers, admin bypass, and self-review settings are GitHub repository settings outside this source tree. Operators must confirm those settings before the first deploy.

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
npm run deploy:preview
```

This uses `wrangler.preview.jsonc`, deploys Worker name `autonomi-md-proxy-preview`, enables `workers_dev`, and does not attach a production route. The deploy script asserts that the preview config has no `route` or `routes` before deployment.

## Production deploy

Production deploys are manual only and run only from the `main` branch. Merging a PR must not deploy production.

From GitHub Actions:

1. Open the repository's **Actions** tab.
2. Select **Deploy Worker Production**.
3. Click **Run workflow** and run it from `main`.
4. When GitHub shows **Review deployments** for the `production` environment, approve it.
5. Wait for the workflow to complete.
6. Run the production smoke tests below against the routed `autonomi.com` URLs.

The job uses the GitHub `production` environment, so configure and confirm required reviewers/protection there before use.

Locally, with Cloudflare credentials exported:

```sh
cd worker
npm run deploy:production
```

This uses `wrangler.jsonc` and deploys Worker name `autonomi-md-proxy` to route `autonomi.com/*`.

The deploy script asserts the production Worker name and route before deployment.

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

Preview smoke tests validate GitHub proxy paths and non-GitHub-serving behaviour: public documentation paths should be served from GitHub when present, while internal-prefix paths, missing Markdown/LLM paths, and non-matching paths should not return GitHub raw content. The preview Worker is not attached to the production `autonomi.com/*` route, so its workers.dev URL cannot validate that fallthrough reaches Framer.

After a production deploy or rollback, use the routed `autonomi.com` URLs to validate both GitHub proxy paths and Framer fallthrough:

```sh
curl -i https://autonomi.com/llms.txt
curl -i https://autonomi.com/llms-full.txt
curl -i https://autonomi.com/overview.md
curl -i https://autonomi.com/worker/README.md
curl -i https://autonomi.com/missing.md
curl -i https://autonomi.com/
```

Expected production/route results:

- `/llms.txt` and `/llms-full.txt` return `Content-Type: text/plain; charset=utf-8` and `Cache-Control: public, max-age=300` when present in GitHub.
- `.md` paths return `Content-Type: text/markdown; charset=utf-8` and `Cache-Control: public, max-age=300` when present in GitHub.
- Internal-prefix paths such as `/worker/README.md` fall through to Framer rather than serving GitHub raw content.
- Missing markdown/LLM paths and non-matching paths fall through to Framer unchanged.

## Rollback

Preferred rollback options:

1. Re-run **Deploy Worker Production** from the last known-good commit.
2. Use the Cloudflare dashboard Worker deployment rollback for `autonomi-md-proxy`.

Run the production smoke tests after rollback.

## Manual Cloudflare zone dependency

The Browser Integrity Check exception for `/llms.txt`, `/llms-full.txt`, and `.md` paths is existing Cloudflare zone-level configuration. It is intentionally not managed by this first PR. Keep that exception in place manually and track source-controlling it as a follow-up.
