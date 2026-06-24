# ADR-0005: Manage autonomi-md-proxy through this repository

- **Status:** Accepted
- **Date:** 2026-06-24
- **Decision owners:** Jim Collinson
- **Reviewers:** Jim Collinson
- **Supersedes:** none
- **Superseded by:** none
- **Related:** ADR-0001 (ADR adoption); ADR-0002 (Worker/GitHub serving); ADR-0003 (`llms.txt`); ADR-0004 (PDF serving); PR #6 (source-controlled Worker deploy config)

## Context

The `autonomi-md-proxy` Cloudflare Worker is production-serving infrastructure for this repository. It sits in front of `autonomi.com`, intercepts machine-readable documentation paths, fetches their source content from `maidsafe/autonomi-llm-docs` on GitHub, and falls through to the Framer-hosted site for normal website traffic.

This means the repository already acts as the source of truth for the public documentation content, but not yet for the Worker behaviour that makes that content available at canonical `autonomi.com` URLs. At the time of this decision, the Worker code is edited through the Cloudflare dashboard. That creates a split source of truth:

- content changes are visible, reviewable, and reversible through GitHub PRs;
- Worker changes require Cloudflare dashboard access;
- Worker history, review, and rollback are weaker than the content history;
- contributors who can improve or troubleshoot the docs-serving behaviour cannot do so without a Cloudflare administrator.

That operational shape is especially awkward for an agent-facing documentation repository. The served files are intended to be consumed by AI tools and contributors working through normal Git workflows. If the docs-serving Worker breaks or needs an update, the normal path should be a repo PR, not dashboard-only editing by a small set of Cloudflare admins.

Cloudflare still has an important role: it is the runtime, observability surface, route owner, and emergency rollback surface. The question is not whether Cloudflare remains in the architecture; ADR-0002 already decides that. The question is where the Worker source, deployment configuration, and normal operating procedure should live.

## Decision Drivers

- Let contributors update, review, and fix Worker behaviour through normal GitHub PRs.
- Remove Cloudflare dashboard access as a requirement for ordinary Worker maintenance.
- Keep the Worker source close to the content it serves.
- Preserve review history, CI validation, and rollback discipline for Worker changes.
- Avoid accidental production deploys from ordinary PR merges.
- Keep Cloudflare dashboard access available for emergency break-glass recovery.
- Leave broader Cloudflare zone configuration source-control as a possible later step, rather than over-scoping the initial migration.

## Considered Options

1. Continue editing the Worker only through the Cloudflare dashboard.
2. Store Worker source in a separate infrastructure repository.
3. Store Worker source, Wrangler config, deployment workflows, and runbook in this repository.
4. Move all Cloudflare configuration, including zone rules and security rules, into Terraform/OpenTofu immediately.

## Decision

We will make `maidsafe/autonomi-llm-docs` the source of truth for the `autonomi-md-proxy` Worker source code, Wrangler configuration, deployment workflows, and operational runbook.

Normal Worker changes will be made through PRs to this repository. The Cloudflare dashboard remains available for observability, emergency rollback, and break-glass edits only. Any break-glass dashboard edit must be reconciled back into this repository so Git returns to being the source of truth.

The repository-managed Worker system has these invariants:

- the Worker source code;
- Wrangler production configuration for the existing `autonomi-md-proxy` Worker;
- a separate preview Worker configuration;
- manual-only GitHub Actions workflows for preview and production deployment;
- CI checks for formatting, syntax, config assertions, and Wrangler dry-runs;
- documentation for secrets, preview deploys, production deploys, smoke tests, rollback, and remaining manual Cloudflare dependencies.

Production deployment must not happen automatically on PR merge. Production-capable deploy workflows must be explicitly dispatched and protected by a GitHub environment approval gate.

This ADR does not decide that all Cloudflare zone configuration is now managed in this repository. DNS proxy status, Browser Integrity Check exceptions, WAF rules, and other zone-level settings may remain manually managed for now. Moving those into Terraform/OpenTofu or another infrastructure-as-code system is a separate future decision.

## Consequences

### Positive

- Worker behaviour becomes reviewable through normal PRs.
- Contributors can propose Worker fixes without needing Cloudflare admin access.
- The docs content and docs-serving Worker live in the same repository, reducing split-brain operational knowledge.
- CI can validate Worker configuration before deployment.
- Manual deploy workflows create a safer path than dashboard editing while preserving human control.
- Rollback can be performed either through GitHub redeploy of a known-good commit or through Cloudflare's deployment rollback in an emergency.
- The Cloudflare dashboard becomes an operational surface rather than the normal source-editing surface.

### Negative / Trade-offs

- The repository now contains operational deployment machinery as well as documentation content.
- GitHub Actions secrets and environment protections become part of the production safety model.
- Contributors must understand that merging Worker code is separate from deploying Worker code.
- The first migration does not eliminate all Cloudflare dashboard state; some zone-level configuration remains outside the repo.
- Break-glass dashboard edits can still create drift if they are not reconciled back into Git.

### Neutral / Operational

- Cloudflare remains the runtime and route owner for `autonomi.com/*`.
- The production Worker name remains `autonomi-md-proxy`.
- The production route remains `autonomi.com/*`.
- The Cloudflare dashboard may still be used for observability and emergency rollback.
- GitHub Actions deploy workflows should be manual-only and should require protected environment approval for production-capable credentials.
- A future ADR may decide to manage Cloudflare zone configuration through Terraform/OpenTofu or equivalent infrastructure-as-code.

## Validation

This decision remains valid if:

- the Worker source and Wrangler configuration exist in this repository;
- CI validates Worker syntax and configuration without deploying;
- PR merge does not automatically deploy production;
- preview deployment can be run from GitHub Actions without attaching the production route;
- production deployment can be run from GitHub Actions without editing Worker code in the Cloudflare dashboard;
- production deploys require a protected GitHub environment approval gate;
- the operational runbook documents smoke tests and rollback;
- any Cloudflare dashboard break-glass edit is followed by a PR reconciling the repository state.

Review triggers:

- a decision to move the Worker to a different repository;
- a decision to make production deploys automatic;
- a decision to remove Cloudflare from the serving architecture;
- a decision to manage Cloudflare zone configuration as code;
- any recurring operational drift between Cloudflare dashboard state and repository state.

## Notes for AI-assisted work

AI tools may help draft this ADR, but **must not mark it Accepted without human review**. Accepted ADRs are immutable: create a new superseding ADR rather than editing an Accepted ADR.

AI agents changing Worker code must inspect this ADR, ADR-0002, and any ADR governing public serving scope before editing Worker behaviour or deployment workflows.
