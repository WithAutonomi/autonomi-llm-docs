# Autonomi Markdown Proxy Worker

This directory contains source-controlled Cloudflare Worker code and deployment configuration for the existing production Worker `autonomi-md-proxy`.

## Current production inventory

- Worker name: `autonomi-md-proxy`
- Production route: `autonomi.com/*`
- Zone: `autonomi.com`
- Compatibility date: `2025-12-09`
- `workers_dev`: disabled for production
- Connected bindings: none
- Observability: logs enabled with 100% sampling; traces disabled in the confirmed production inventory
- Behaviour: serve `.md`, `/llms.txt`, and `/llms-full.txt` from `maidsafe/autonomi-llm-docs` on GitHub, falling back to Framer for misses and all other paths

## Local setup

Use Node.js 22 or newer.

```sh
cd worker
npm ci
npm run check
```

`npm run check` performs formatting, JavaScript syntax, and Wrangler dry-run validation for both preview and production configs. It does not deploy.

## GitHub secrets

Manual deploy workflows require these repository or organization secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The Cloudflare API token should be scoped only as broadly as needed for this Worker, including Workers script edit access and route access for the `autonomi.com` zone.

## Preview deploy

Preview deploys are manual only and do not use the production GitHub environment approval gate.

From GitHub Actions, run **Deploy Worker Preview**. Locally, with Cloudflare credentials exported:

```sh
cd worker
npm run deploy:preview
```

This uses `wrangler.preview.jsonc`, deploys Worker name `autonomi-md-proxy-preview`, enables `workers_dev`, and does not attach a production route.

## Production deploy

Production deploys are manual only. Merging a PR must not deploy production.

From GitHub Actions, run **Deploy Worker Production**. The job uses the GitHub `production` environment, so configure required reviewers/protection there before use. Locally, with Cloudflare credentials exported:

```sh
cd worker
npm run deploy:production
```

This uses `wrangler.jsonc` and deploys Worker name `autonomi-md-proxy` to route `autonomi.com/*`.

## Smoke tests

After a preview deploy, use the workers.dev URL printed by Wrangler:

```sh
curl -i "$PREVIEW_URL/llms.txt"
curl -i "$PREVIEW_URL/llms-full.txt"
curl -i "$PREVIEW_URL/overview.md"
curl -i "$PREVIEW_URL/"
```

After a production deploy or rollback:

```sh
curl -i https://autonomi.com/llms.txt
curl -i https://autonomi.com/llms-full.txt
curl -i https://autonomi.com/overview.md
curl -i https://autonomi.com/
```

Expected results:

- `/llms.txt` and `/llms-full.txt` return `Content-Type: text/plain; charset=utf-8` and `Cache-Control: public, max-age=300` when present in GitHub.
- `.md` paths return `Content-Type: text/markdown; charset=utf-8` and `Cache-Control: public, max-age=300` when present in GitHub.
- Missing markdown/LLM paths and non-matching paths fall through to Framer unchanged.

## Rollback

Preferred rollback options:

1. Re-run **Deploy Worker Production** from the last known-good commit.
2. Use the Cloudflare dashboard Worker deployment rollback for `autonomi-md-proxy`.

Run the production smoke tests after rollback.

## Manual Cloudflare zone dependency

The Browser Integrity Check exception for `/llms.txt`, `/llms-full.txt`, and `.md` paths is existing Cloudflare zone-level configuration. It is intentionally not managed by this first PR. Keep that exception in place manually and track source-controlling it as a follow-up.
