# ADR-0008: Serve public documentation from Cloudflare Static Assets

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Jim Collinson
- **Reviewers:** Jim Collinson; David Irvine (Hermes-assisted review)
- **Supersedes:** ADR-0002
- **Superseded by:** none
- **Related:** ADR-0004 (PDF serving); ADR-0005 (Worker management); ADR-0006 (public serving scope)

## Context

Runtime GitHub Raw makes PR-managed documents depend on upstream requests; failures can fall through to Framer as missing.

## Decision Drivers

- Reliable canonical documentation.
- PR-and-merge publication.
- No runtime GitHub dependency.
- Preserve ADR-0006 and Framer fallthrough for paths without a matching published asset.

## Considered Options

1. Runtime GitHub — retains the dependency.
2. KV/R2 — adds synchronisation state.
3. Cloudflare Static Assets, Worker-first — makes user Worker execution part of every matching asset request, adding cost, limits, availability dependencies, and routing complexity without needed behaviour.
4. Cloudflare Static Assets, asset-first — chosen.

## Decision

The Cloudflare Worker remains on `autonomi.com/*`, with Framer as origin and fallthrough for requests without a matching published asset. Intercepted records remain Cloudflare-proxied.

Cloudflare Static Assets use the default asset-first routing. For a request whose path matches a published asset, `GET` and `HEAD` serve the asset. Other methods that Cloudflare routes to Static Assets return `405 Method Not Allowed`. These matching asset requests do not invoke the user Worker or reach Framer. Requests without a matching published asset continue to the Worker and may fall through to Framer.

Static Assets contain regular Git blobs admitted by ADR-0006, plus `/llms.txt` and `/llms-full.txt`; non-regular modes are excluded. ADR-0006 remains authoritative except for its GitHub-fetch/error wording. Markdown uses `text/markdown; charset=utf-8`; indexes use `text/plain; charset=utf-8`; both retain `Cache-Control: public, max-age=300`.

PDFs remain outside scope: documents use direct `raw.githubusercontent.com` links and apex `.pdf` requests fall through. ADR-0004 remains Proposed.

This ADR explicitly refines ADR-0005's production-deployment rule: content-only changes publish automatically after merge, without dispatch or protected approval, while mixed changes and serving-machinery changes remain on ADR-0005's manual dispatch and protected approval path. Content-only is selected public content with unchanged machinery. Machinery includes Worker source, Wrangler configuration, asset-selection/build logic, deployment machinery, and workflows.

Automation checks unchanged approved machinery, an active runtime reconciled to the exact manually deployed baseline, and current `main`. The workflow and classifier are candidate-controlled; PR review and ordinary checks are the trust boundary. We add no independent publisher, state service, credential architecture, or atomic interlock. Runs recheck `main` immediately before publication and are serialised where practical; bypass, stale-publication, and rollback races remain accepted.

Operators quiesce automatic runs before manual rollback or redeploy. Publication remains stopped until the runtime is reconciled as the approved baseline. No custom provenance or duplicate audit system is added; Git and deployment history suffice.

## Consequences

### Positive

- Scoped documents no longer depend on GitHub at request time.
- Editors retain PR-and-merge publication.

### Negative / Trade-offs

- Content mistakes can reach production; candidate-controlled machinery can weaken checks.
- Rollback is not atomic, and drift can delay publication.
- Asset-first routing deliberately returns `405 Method Not Allowed` for methods other than `GET` and `HEAD` that Cloudflare routes to Static Assets, including `OPTIONS`, rather than allowing those requests to reach the Worker or Framer.

### Neutral / Operational

- Cloudflare stores the assets; Framer remains the website origin.

## Validation

- The inventory handles add, update, delete, and rename, excluding unsafe Git modes; removed paths stop serving asset bytes after cache expiry.
- Headers, DNS, non-asset fallthrough, PDFs, and runtime GitHub absence match this decision.
- Integrated Static Assets tests verify that matching published assets serve `GET` and `HEAD`; `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS` return `405 Method Not Allowed`; and none of these matching-asset requests invokes the user Worker.
- Classification and baseline checks auto-publish content-only changes while mixed changes retain ADR-0005 gates.
- Tests cover current-`main` checks, serialisation, rollback quiescence, and reconciliation without claiming atomic guarantees.

Review if the content source, serving scope, trust boundary, or Cloudflare/Framer arrangement changes.

## Notes for AI-assisted work

AI tools may draft this ADR but must not mark it Accepted. Accepted ADRs are immutable; changes require a superseding ADR.
