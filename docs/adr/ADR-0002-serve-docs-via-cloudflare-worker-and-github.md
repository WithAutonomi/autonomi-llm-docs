# ADR-0002: Serve documentation at autonomi.com via a Cloudflare Worker backed by GitHub

- **Status:** Accepted
- **Date:** 2026-06-24
- **Decision owners:** Jim Collinson
- **Reviewers:** Jim Collinson (retrospective — author attestation)
- **Supersedes:** none
- **Superseded by:** none
- **Related:** ADR-0001 (ADR adoption); ADR-0003 (`llms.txt`); ADR-0004 (PDF serving); ADR-0005 (Worker source management)

> **Retrospective ADR.** This record reconstructs a decision made earlier in development, before the ADR process existed in this repo. It was backfilled on 2026-06-24 and accepted by the decision owner during PR #6 review, on the basis of the decision owner's attestation and direct inspection of the deployed system; it was not produced by contemporaneous review.

## Context

Autonomi needed documentation that both humans and AI agents could read at stable `autonomi.com` URLs (e.g. `autonomi.com/overview.md`, `autonomi.com/llms.txt`). The primary `autonomi.com` site is hosted on Framer, which serves the marketing/design surface well but is not a natural home for plain-text/Markdown files served at clean paths, version-controlled in Git, and edited through a normal PR workflow.

We wanted: source content living in a Git repository (reviewable, diffable, AI-maintainable); clean canonical URLs on the primary domain rather than a separate `docs.` subdomain or a `raw.githubusercontent.com` link; and no migration of the existing Framer-hosted site. The tension is that one domain needed to serve two different kinds of content — the Framer site and the Git-backed Markdown — from the same origin.

## Decision Drivers

- Canonical URLs on `autonomi.com`, not a subdomain or third-party raw host.
- Content source-controlled in GitHub with a standard PR/review flow.
- No disruption to the existing Framer-hosted marketing site.
- Low operational overhead; no servers to run or maintain.
- Markdown served as readable text/Markdown, not rendered HTML, so agents get clean source.

## Considered Options

1. **Host docs inside Framer.** Rejected: Framer is not suited to serving raw Markdown at clean paths under version control, and couples docs to the design tool.
2. **Serve docs from a `docs.autonomi.com` subdomain** (e.g. GitHub Pages or similar). Workable, but fragments canonical URLs away from the apex domain and weakens the "everything lives at autonomi.com" goal.
3. **Link directly to `raw.githubusercontent.com`** for human-facing documentation URLs. Rejected for canonical pages: leaks the hosting choice and ties published URLs to GitHub's domain. (Note: this *is* used deliberately for PDF assets — see ADR-0004.)
4. **Cloudflare Worker in front of `autonomi.com` that intercepts documentation requests and fetches their content from the GitHub repo, passing everything else through to Framer.** Chosen.

## Decision

We route `autonomi.com` through Cloudflare and run a Cloudflare Worker that intercepts documentation requests and serves their content by fetching from the `maidsafe/autonomi-llm-docs` GitHub repository (branch `main`, via `raw.githubusercontent.com`). All other requests fall through to the existing Framer-hosted site.

The Worker intercepts exactly these paths:

- any path ending in `.md`
- `/llms.txt`
- `/llms-full.txt`

Matched `.md` paths are returned with `Content-Type: text/markdown; charset=utf-8`; the `.txt` index files are returned as `text/plain; charset=utf-8`. Responses carry a short cache (`max-age=300`).

If the GitHub fetch for a matched path does **not** return OK (e.g. the file does not exist in the repo), the Worker does not error — it falls through to Framer. This graceful fallback means a mistyped or absent `.md` path degrades to normal site behaviour rather than a hard failure.

For interception to work, the relevant `autonomi.com` DNS records must be **Proxied** (orange-cloud) in Cloudflare rather than DNS-only (grey-cloud), so traffic passes through Cloudflare where the Worker can act on it. DNS-only records bypass the Worker entirely and were the cause of early interception failures during development.

### Management state and later refinement

At the time this architecture was first deployed, the Worker source was authored and edited only via the Cloudflare web UI. This ADR records the serving architecture: a Cloudflare Worker in front of `autonomi.com`, GitHub raw content for machine-readable documentation, and Framer fallthrough for normal site traffic.

Worker source management was decided separately in ADR-0005. ADR-0005 makes this repository the source of truth for Worker source code, Wrangler configuration, deployment workflows, and the operational runbook, with the Cloudflare dashboard reserved for observability, rollback, and break-glass recovery.

## Consequences

### Positive

- Documentation is served from clean, canonical `autonomi.com` URLs.
- Content is fully version-controlled in GitHub with a normal review/PR workflow.
- The Framer site is untouched; the two content types coexist on one domain.
- No bespoke server or hosting to maintain — the Worker plus GitHub is the whole pipeline.
- Markdown is served as source text, ideal for LLM consumption.
- The graceful GitHub-fail → Framer fallback avoids hard failures on missing paths.

### Negative / Trade-offs

- Introduces a dependency on Cloudflare Workers as serving infrastructure.
- The Worker's routing logic (which paths it intercepts) is an architectural surface that must be kept correct; a mistake can shadow or leak Framer routes.
- DNS proxy status is load-bearing: flipping a record to DNS-only silently breaks doc serving.
- Two sources of truth for one domain (Framer + GitHub) can confuse contributors who don't know the split.
- At initial deployment, Worker source was unversioned and Cloudflare-UI-only. ADR-0005 addresses this by moving normal Worker source/config/deploy management into this repository while keeping Cloudflare available for observability, rollback, and break-glass recovery.

### Neutral / Operational

- DNS: web-facing records that must be intercepted are Proxied; backend-only services and email (MX) remain DNS-only.
- Adding a new documentation path means ensuring it matches the Worker's interception rules (`.md`, `/llms.txt`, `/llms-full.txt`).
- Non-Markdown assets (e.g. PDFs) are **not** intercepted and resolve elsewhere — see ADR-0004.

## Validation

- `autonomi.com/whitepapers/autonomous-network.md` resolves to GitHub-sourced content with `Content-Type: text/markdown; charset=utf-8` (verified 2026-06-24).
- `autonomi.com/llms.txt` and `autonomi.com/llms-full.txt` resolve to repo content.
- Normal site pages still resolve to Framer.
- Required `autonomi.com` records are Proxied in Cloudflare (owner-confirmed; not inspectable from the repo).
- Review trigger: any change to the Worker's routing rules, the hosting of the marketing site, the DNS proxy posture, or the Worker source-management model (ADR-0005) requires revisiting this ADR.

## Notes for AI-assisted work

AI tools may help draft this ADR, but **must not mark it Accepted without human review**. Accepted ADRs are immutable: create a new superseding ADR rather than editing an Accepted ADR. Before changing the Worker's interception logic or DNS posture, inspect this ADR and ADR-0004.
