# ADR-0008 delivery plan

## Objective

Implement Accepted ADR-0008 with the minimum repository machinery: deterministic Git asset staging, asset-first Cloudflare Static Assets, standard pinned Wrangler deployment, a simple manual-baseline guard, and short human recovery. The binding behaviour is in `worker/ADR-0008-IMPLEMENTATION.markdown` (the **contract**).

## Working rules

- Git is the source of truth. Accepted ADR-0005, ADR-0006, and ADR-0008 are immutable and controlling.
- Implement one slice at a time. Keep local evidence honest; GitHub Actions CI is green of record for each pushed exact head.
- Do not add dependencies, custom deployment state, a direct Cloudflare API client, credential discovery, exhaustive control-plane parsers, or automated rollback coordination.
- Stop if a slice needs an unapproved gate, CI, harness, build, environment, credential, setting, architecture, public-interface, or deployment change.
- Platform and operational unknowns belong at the later attended/live checkpoint, not in speculative local machinery.

The slice entries below preserve their original authorization boundaries. Jim separately authorized the Slice 4 branch, commit, push, and Draft PR actions now recorded in the Slice 4 checkpoint. Merge and all live actions remain unauthorized.

## Slice 0 — Minimum packet reset

Original status: authorized for local completion only. It is now historical and complete.

The earlier detailed candidate remains only in the disposable review packet. Its direct-activation-helper findings are superseded by the owner's standard-Wrangler simplification; they are not silently carried as unresolved requirements.

## Slice 1 — Deterministic staging

Original status: **authorized for local implementation after a lightweight ADR alignment check**. That authorization did not include branch, commit, push, or PR actions; those actions were authorized separately at Slice 4.

### Changes

- Add one small deterministic staging implementation under `worker/`.
- Add focused fixtures/tests for contract **Deterministic asset staging** and its staging acceptance family.
- Add only the package invocation needed to run staging and its tests.

### Verification

- Run focused staging tests and the existing Worker checks without changing their bar.
- Prove repeatable exact output from an explicit commit and independence from worktree/index content.
- Record changed files, commands, results, and any boundary mismatch.

### Stop if

A dependency, ADR change, new content policy, test-harness/build/environment change beyond the approved package invocation, or platform reinterpretation is needed.

## Slice 2 — Static Assets routing

Original mechanism checkpoint: approval was required before the config, Worker, and integrated-test changes; it was granted separately before implementation.

### Changes

- Configure preview and production Static Assets exactly as the contract requires while preserving production route/settings.
- Replace runtime GitHub fetching with the one-call fallback-only Worker.
- Add integrated pinned-Wrangler tests for matching asset methods, `HEAD`, control-file non-exposure, exclusions, and non-asset fallthrough.

### Verification

- Run format, syntax, config assertions, dry-runs, existing tests, and integrated routing tests locally.
- Confirm no production deployment or external state change occurred.
- Stop for contract review if ordinary pinned Wrangler does not produce the accepted asset-first behaviour.

## Slice 3 — Baseline guard and standard workflows

Original mechanism checkpoint: approval was required before editing workflows, CI coverage, or the runbook; it was granted separately before implementation.

### Changes

- Add the simple Git/native-metadata baseline guard and current-main check.
- Add standard pinned `wrangler deploy` preview, protected manual production, and every-safe-`main` automatic complete-set workflows using exact config/name pairs, GitHub-hosted runners, named step-scoped secrets, and shared production concurrency.
- Update CI/static assertions and the short deploy/rollback runbook.

### Verification

- Fixture-test unchanged-machinery allow and drift/stale/unsafe refusal paths.
- Run the complete local gate and static workflow checks without credentials.
- Confirm automatic publication has no protected manual approval dependency but cannot authenticate until the later owner credential checkpoint.
- Confirm no direct activation helper, custom state, generic target input, automated run scanning, or automatic rollback exists.

## Slice 4 — Branch, PR, CI, and review milestone

Status: branch, commit, push, and Draft PR actions were separately authorized and are in progress. Merge and all live actions remain unauthorized.

1. Owner authorization to create/use the implementation branch and commit the exact reviewed artifacts plus Slices 1–3 was granted separately.
2. Separate authorization to push and open the Draft PR was granted.
3. Require clean GitHub Actions CI, then exact-head code/spec, ADR-alignment, adversarial, Craft, and behaviour-complete clean-context review. Fix real blockers and rerun affected evidence without reopening settled design.
4. Separate merge authorization is still required; if granted, record the merge SHA and require post-merge CI green.

No Cloudflare authentication or deployment occurs in this milestone.

## Slice 5 — Attended preview and production activation

Live/membrane checkpoints are separate and exact:

1. Decide and authorize the live account, credential permissions/resource/storage, target, current platform constraints, and exact preview action. Unknowns stop here rather than creating more machinery.
2. Deploy and verify preview through the protected standard Wrangler path; prove asset routing/fallthrough and production unchanged.
3. Separately authorize and perform the protected manual production baseline; verify config, native metadata, public behaviour, and rollback readiness.
4. Separately authorize automatic credential availability and workflow activation, then observe the first eligible safe-`main` complete-set publication and verify native/public evidence.

Any credential, setting, deployment, rollback, dashboard, or subsequent PR/merge action outside the exact approval stops.

## Handoff

After each slice, update `planning/STATE.md` and its checkpoint with exact files/blobs, local and CI evidence, ADR alignment, review findings, deviations, blockers, and the next named authorization. Do not call a local uncommitted result CI-backed or deployment-ready.
