# ADR-0001: Adopt Architecture Decision Records

- **Status:** Accepted
- **Date:** 2026-06-24
- **Decision owners:** Jim Collinson
- **Reviewers:** Jim Collinson
- **Supersedes:** none
- **Superseded by:** none
- **Related:** Autonomi/Saorsa portfolio ADR standard; paired repo `autonomi-skill` (`docs/adr`); ADR-0002, ADR-0003, ADR-0004 in this repo

## Context

This repository (`autonomi-llm-docs`) holds the AI-friendly documentation surfaced at `autonomi.com` — network overviews, developer context, the `llms.txt` discovery file, and Markdown conversions of the foundational MaidSafe whitepapers. Although the repo's primary output is documentation rather than running code, the way that content is built, served, and discovered involves real architectural decisions: a Cloudflare Worker that intercepts requests and fetches from GitHub, a DNS/proxy configuration that makes interception possible, adoption of the `llms.txt` convention, and a strategy for how PDF assets are addressed.

These decisions were made during development and were, until now, recorded only in chat history and commit messages. That is exactly the kind of context that drifts or disappears, especially as parts of this repo are maintained with AI assistance. The wider Autonomi/Saorsa portfolio already defines a standard ADR mechanism (adopted in sibling repos such as `autonomi-skill`); this repo should adopt that same mechanism rather than invent its own.

## Decision Drivers

- Preserve the reasoning behind architectural choices, not just the outcome.
- Make trade-offs visible during review.
- Give humans and AI tools a reliable, version-controlled source of architectural context.
- Prevent silent drift from agreed decisions.
- Stay consistent with Autonomi and Saorsa repositories so contributors move between repos without relearning conventions.

## Considered Options

1. Keep architecture reasoning only in PR descriptions and issues.
2. Maintain informal design notes without lifecycle governance.
3. Adopt the portfolio's version-controlled ADRs with the standard template and lifecycle.

## Decision

We will maintain Architecture Decision Records in `docs/adr/` using the team-standard mechanics mirrored from the portfolio (`TEMPLATE.md`, `README.md`, `TOOLING.md`, `.adr-kit.yaml`, `scripts/adr-governance.py`, and the `adr-governance.yml` CI gate). New decisions start as `Proposed`; acceptance is a human gate (Jim for this repo). `Accepted` ADRs are immutable: a changed decision is recorded as a new superseding ADR rather than by editing the accepted record.

## Consequences

### Positive

- Architectural intent behind the docs-serving pipeline becomes searchable and reviewable.
- AI agents have explicit constraints to inspect before changing how content is built or served.
- Reviews check decision quality, not just mechanics.
- Supersession creates an audit trail instead of rewriting history.

### Negative / Trade-offs

- Design work becomes more explicit and may slow rushed changes.
- ADRs must be kept aligned with meaningful architectural changes to the build/serve pipeline.

### Neutral / Operational

- This repo mirrors the portfolio standard; if the standard evolves upstream, this repo re-syncs rather than diverging.
- This repo ships the standard `.adr-kit.yaml`, `scripts/adr-governance.py`, and the `adr-governance.yml` CI gate; ADR format, valid status, required sections, duplicate numbers, and immutable-`Accepted` status are enforced in CI on every PR that touches `docs/adr/`. Review remains the gate for decision *quality*.

## Validation

Reviewers verify that architectural changes (serving, discovery, content-format, DNS/CDN behaviour) carry appropriate ADR coverage and that accepted ADRs are not modified in place. The `adr-governance` CI check must pass on every PR that touches `docs/adr/`.

## Notes for AI-assisted work

AI tools may help draft this ADR, but **must not mark it Accepted without human review**. Accepted ADRs are immutable: create a new superseding ADR rather than editing an Accepted ADR.
