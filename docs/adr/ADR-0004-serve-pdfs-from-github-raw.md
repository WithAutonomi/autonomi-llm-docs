# ADR-0004: Serve whitepaper PDFs directly from GitHub raw, not via the apex domain

- **Status:** Proposed
- **Date:** 2026-06-24
- **Decision owners:** Jim Collinson
- **Reviewers:** Jim Collinson (retrospective — author attestation)
- **Supersedes:** none
- **Superseded by:** none
- **Related:** ADR-0002 (Worker/GitHub serving); ADR-0003 (`llms.txt`); ADR-0007 (repository transfer)

> **Retrospective ADR.** This record reconstructs a decision made earlier in development, before the ADR process existed in this repo. It is backfilled and proposed on 2026-06-24, on the basis of the decision owner's attestation and direct inspection of the deployed system; it was not produced by contemporaneous review.

## Context

The foundational MaidSafe whitepapers are published in two forms in this repo: a Markdown conversion (machine-readable, served at `autonomi.com/whitepapers/<paper>.md`) and the original PDF (the authoritative, citable artefact for humans). The decision to keep both forms is editorial/content and is not the subject of this ADR.

The planned repository transfer in ADR-0007 prompted this Proposed ADR to use the destination `WithAutonomi` owner namespace for current raw URLs. That namespace update does not change the direct-GitHub-raw serving decision recorded here.

The architectural question this ADR settles is narrower: **how should the PDF be addressed in a link, given how the serving pipeline works?** The Cloudflare Worker (ADR-0002) intercepts only `.md`, `/llms.txt`, and `/llms-full.txt`. It has no behaviour for `.pdf` requests, so a PDF path under `autonomi.com` is not served from the repo — it falls through to Framer, where the file does not exist. Therefore a relative sibling link (`<paper>.pdf`) or an apex link (`autonomi.com/whitepapers/<paper>.pdf`) from within a served Markdown page would not resolve to the PDF in the repo.

## Decision Drivers

- PDF download links must resolve reliably to the actual file in the repo.
- The link approach must be correct given the Worker intercepts `.md`/`.txt` but not `.pdf`.
- Avoid introducing PDF-serving behaviour into the pipeline before it is needed.

## Considered Options

1. **Relative/sibling path** (e.g. `<paper>.pdf` next to the `.md`). Rejected: the Worker does not serve `.pdf`, so this resolves against the apex domain and falls through to Framer, not the repo.
2. **Apex absolute path** (`autonomi.com/whitepapers/<paper>.pdf`). Rejected for the same reason — no Worker interception for `.pdf`.
3. **Explicit `raw.githubusercontent.com` URL** pointing at the PDF in this repo. Chosen: serves the PDF bytes directly from GitHub, bypassing the Worker, which is correct because the Worker has no PDF behaviour.
4. **Extend the Worker to serve PDFs from GitHub** under apex URLs. Not chosen now; noted as the future option that would supersede this decision.

## Decision

Whitepaper Markdown pages link to their PDF using an explicit `raw.githubusercontent.com` URL pointing at the file in `WithAutonomi/autonomi-llm-docs` (branch `main`), rather than a relative sibling path or an `autonomi.com` apex path. This is because the Worker does not intercept `.pdf` requests, so only a direct GitHub-raw URL resolves to the actual file.

Post-transfer example: `autonomi.com/whitepapers/autonomous-network.md` links its PDF as `https://raw.githubusercontent.com/WithAutonomi/autonomi-llm-docs/main/whitepapers/Autonomous-Network.pdf`.

If the Worker is later extended to serve PDFs from GitHub under apex URLs, this ADR should be superseded and the links migrated to canonical `autonomi.com` paths.

## Consequences

### Positive

- PDF links resolve reliably regardless of Worker behaviour.
- No PDF-serving logic added to the Worker before it is warranted.
- The decision is consistent with, and explained by, the Worker's documented intercept rules (ADR-0002).

### Negative / Trade-offs

- PDF links point at `raw.githubusercontent.com`, which leaks the hosting choice and is inconsistent with the "canonical apex URL" goal used for Markdown (ADR-0002/0003). This is a deliberate trade-off pending possible Worker PDF support.
- If the repo or its default branch is ever renamed, these absolute raw URLs break and must be updated.

### Neutral / Operational

- New whitepapers follow the same convention: link the PDF via its `raw.githubusercontent.com` URL.
- Exact per-file link strings and filename casing are content details, maintained via PR review.
- A future ADR (Worker PDF support) would supersede this and move links to apex URLs.

## Validation

- After the ADR-0007 transfer and namespace migration, the PDF link in `autonomi.com/whitepapers/autonomous-network.md` is a `raw.githubusercontent.com` URL under `WithAutonomi/autonomi-llm-docs` and downloads the correct file.
- Review trigger: any change to Worker PDF behaviour, or to where the PDFs are hosted, or a rename of the repo/branch, requires revisiting this ADR.

## Notes for AI-assisted work

AI tools may help draft this ADR, but **must not mark it Accepted without human review**. Accepted ADRs are immutable: create a new superseding ADR rather than editing an Accepted ADR. When adding a whitepaper, link its PDF via the repo's `raw.githubusercontent.com` URL until/unless ADR supersession introduces apex PDF serving.
