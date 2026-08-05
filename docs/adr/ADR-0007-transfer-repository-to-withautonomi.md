# ADR-0007: Transfer repository ownership to WithAutonomi

- **Status:** Accepted
- **Date:** 2026-08-04
- **Decision owners:** Jim Collinson
- **Reviewers:** Jim Collinson
- **Supersedes:** none
- **Superseded by:** none
- **Related:** ADR-0002 (Worker/GitHub serving); ADR-0004 (PDF serving); ADR-0005 (Worker source management); repository-transfer implementation PR

## Context

This repository contains Autonomi's machine-readable documentation and the source and deployment configuration for the Cloudflare Worker that serves it at `autonomi.com`. It currently belongs to the MaidSafe GitHub organization, while current ownership, access, and operational responsibility sit with the Autonomi team in the WithAutonomi organization.

Moving the content into a newly created repository would split or duplicate the repository's identity and risk losing continuity across history, pull requests, issues, references, and integrations. GitHub's repository-transfer mechanism instead moves the existing repository object, preserving its repository ID and Git history while changing its organization namespace.

The transfer also changes the namespace embedded in the Worker's GitHub raw origin and the whitepaper PDF links. The destination `WithAutonomi/autonomi-llm-docs` does not exist before the manual transfer, so those changes cannot safely become live until the repository exists there and its post-transfer controls have been validated.

ADR-0002 and ADR-0005 name the current MaidSafe repository because they record the architecture as it existed when those decisions were accepted. They are immutable historical records. Their broader decisions—Cloudflare Worker delivery backed by GitHub, this repository as the source of truth, and source-controlled Worker operations—remain in force.

## Decision Drivers

- Align repository ownership and operational control with the Autonomi team.
- Preserve one repository object, its ID, full Git history, and associated GitHub history.
- Establish one unambiguous canonical repository and GitHub raw origin.
- Keep the `autonomi.com` documentation service and all five whitepaper PDFs available through a controlled cutover.
- Avoid relying on a permanent redirect, mirror, or dual-origin Worker implementation.
- Preserve the audit trail and broader decisions in Accepted ADR-0002 and ADR-0005.

## Considered Options

1. Leave the repository in `maidsafe` and continue operating it across organization boundaries.
2. Create a new repository under `WithAutonomi` and copy or mirror the content and history.
3. Manually transfer the existing GitHub repository object to `WithAutonomi`, then make the destination namespace canonical.

## Decision

Jim Collinson will manually transfer the existing GitHub repository object from `maidsafe/autonomi-llm-docs` to `WithAutonomi/autonomi-llm-docs`. The transfer must preserve the repository ID and Git history; creating a replacement repository is not an equivalent migration.

Once this ADR is accepted and the manual transfer has completed, `WithAutonomi/autonomi-llm-docs` is the canonical repository. `https://raw.githubusercontent.com/WithAutonomi/autonomi-llm-docs/main` is the canonical GitHub raw origin for the Cloudflare Worker and repository-hosted assets.

ADR-0002 and ADR-0005 remain immutable and continue to govern the broader Cloudflare/GitHub serving architecture and source-control model. Where their literal pre-transfer repository namespace conflicts with this ADR, this ADR is authoritative once Accepted. ADR-0004 remains the decision governing direct GitHub-raw PDF delivery and is aligned to the destination namespace while still Proposed.

GitHub's old-namespace redirect is transitional compatibility for a controlled, short cutover window, not a second canonical origin or a permanent dependency. No temporary dual-origin Worker logic will be introduced. The path `maidsafe/autonomi-llm-docs` must never be recreated, because doing so would capture old links and invalidate the redirect to the transferred repository.

The implementation PR may be prepared before the transfer so it travels with the repository, but it must not be merged or deployed until the destination exists and post-transfer repository controls have been validated. Preview deployment and validation must precede the separately approved production deployment.

## Consequences

### Positive

- Repository ownership, team access, and operational responsibility align under `WithAutonomi`.
- Repository identity, Git history, and GitHub continuity are preserved instead of copied or fragmented.
- The Worker and PDF links converge on one canonical raw-content origin.
- The short redirect window provides compatibility while the prepared implementation is validated and deployed.

### Negative / Trade-offs

- There is a cutover interval in which the old namespace redirects while the live Worker still uses its pre-transfer raw origin.
- Repository settings, access, secrets, environments, branch controls, and integrations require explicit post-transfer validation.
- Absolute raw URLs must change with the organization namespace.

### Neutral / Operational

- The repository transfer itself is a manual, human-owned GitHub operation.
- Merging the implementation and deploying the Worker remain separate actions, with production deployment protected by environment approval.
- Historical MaidSafe content, company references, email addresses, and organization links that are not the repository's current namespace remain unchanged.

## Validation

The transfer remains valid only if the destination reports the same GitHub repository ID and expected `main` commit SHA as the source, and the old and new GitHub raw URLs return byte-identical content during the redirect window. Repository CI must pass in the destination, and organization/repository access, branch controls, secrets, protected deployment environment approval, workflows, webhooks, GitHub Apps, and other required integrations must be confirmed after transfer.

The implementation must then be validated through preview before the separately approved production deployment. After production deployment, canonical `autonomi.com` documentation paths must serve content from the destination raw origin, and all five whitepaper Markdown pages must download their corresponding PDFs from that origin with the expected hashes. Any repository ID or SHA mismatch, raw-content hash mismatch, CI failure, missing approval control, broken canonical document, PDF mismatch, or lost required access/integration blocks completion of the cutover.

Review triggers include another repository owner or name change, a change to the canonical raw-content host, replacement of the GitHub repository object, or any proposal to recreate the old namespace.

## Notes for AI-assisted work

AI tools may help draft this ADR, but **must not mark it Accepted without human review**. Accepted ADRs are immutable: create a new superseding ADR rather than editing an Accepted ADR. AI tools must not perform the repository transfer, merge or deploy the implementation, recreate the old namespace, or introduce dual-origin compatibility without a new approved decision.
