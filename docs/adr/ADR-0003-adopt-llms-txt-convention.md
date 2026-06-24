# ADR-0003: Adopt the `llms.txt` convention for AI-agent discovery

- **Status:** Proposed
- **Date:** 2026-06-24
- **Decision owners:** Jim Collinson
- **Reviewers:** Jim Collinson (retrospective — author attestation)
- **Supersedes:** none
- **Superseded by:** none
- **Related:** ADR-0002 (Worker/GitHub serving); ADR-0004 (PDF serving)

> **Retrospective ADR.** This record reconstructs a decision made earlier in development, before the ADR process existed in this repo. It is backfilled and proposed on 2026-06-24 (accepted on merge of this PR), on the basis of the decision owner's attestation and direct inspection of the deployed system; it was not produced by contemporaneous review.

## Context

The purpose of this repository is to make Autonomi legible to AI agents and the developers using them, not only to human readers browsing a site. LLMs and agent frameworks increasingly look for a single, predictable entry point that enumerates a site's key documentation in a machine-friendly form, rather than crawling rendered HTML and inferring structure.

`llms.txt` is an emerging community convention (analogous in spirit to `robots.txt` or `sitemap.xml`) that provides exactly this: a Markdown file at a well-known path listing the canonical documentation resources, so an agent can orient itself quickly. A companion `llms-full.txt` variant provides expanded inline context in a single fetch. Since we were already serving clean Markdown at `autonomi.com` (ADR-0002), publishing these index files via the same pipeline was a natural fit.

This ADR concerns the architectural decision to adopt the convention and serve these entry points. The *content* of the index (which resources are listed, section headings, ordering) is editorial and governed by normal PR review, not by this ADR.

## Decision Drivers

- Give AI agents a single, predictable discovery entry point.
- Point agents at curated Markdown resources rather than letting them scrape the Framer HTML.
- Follow an emerging cross-industry convention rather than inventing a bespoke index format.
- Keep the index version-controlled and reviewable alongside the content it lists.

## Considered Options

1. **No machine index.** Let agents crawl the site and infer structure. Rejected: unreliable, and gives agents the HTML marketing surface instead of curated source.
2. **A bespoke/custom index format** (custom JSON manifest, sitemap variant, etc.). Rejected: no ecosystem support, more maintenance, no agent recognises it out of the box.
3. **Adopt `llms.txt`** (plus the `llms-full.txt` variant) at the apex domain, served via the same Worker pipeline. Chosen.

## Decision

We adopt the `llms.txt` convention as the machine-discovery entry point for Autonomi documentation, published at `autonomi.com/llms.txt`, with an expanded `autonomi.com/llms-full.txt` variant for inline context. Both are served from this repository via the Cloudflare Worker (ADR-0002), which intercepts both paths and returns them from GitHub.

The specific resources listed, the section structure, and the wording of the index are treated as content (editorial, PR-reviewed), not as architectural decisions under this ADR.

## Consequences

### Positive

- Agents get an immediate, curated map of Autonomi's documentation.
- The index lives with the content, so it is updated through the same PR/review flow.
- Aligns Autonomi with a convention agents are increasingly likely to look for.
- The `llms-full.txt` variant lets an agent pull substantial context in one request.

### Negative / Trade-offs

- `llms.txt` is an evolving convention; its format expectations may shift and require updates.
- The index must be kept in sync as documents are added, renamed, or moved, or it will point agents at stale paths. (This is ongoing content maintenance, not an architectural cost.)
- Maintaining two index files (`llms.txt` and `llms-full.txt`) means keeping both coherent.

### Neutral / Operational

- Both files must remain among the paths the Worker intercepts (ADR-0002).
- Links within the indexes use canonical `autonomi.com` URLs for Markdown resources; PDF links are an intentional exception (raw GitHub URLs — see ADR-0004).

## Validation

- `autonomi.com/llms.txt` and `autonomi.com/llms-full.txt` resolve and serve repo content (verified via the same Worker pipeline as ADR-0002, 2026-06-24).
- Review trigger: a meaningful change in the `llms.txt` community specification, or a decision to add/remove an index variant, prompts a review of this ADR. (Routine edits to the *contents* of the indexes do not.)

## Notes for AI-assisted work

AI tools may help draft this ADR, but **must not mark it Accepted without human review**. Accepted ADRs are immutable: create a new superseding ADR rather than editing an Accepted ADR. When adding or moving documentation, update the index files in the same change.
