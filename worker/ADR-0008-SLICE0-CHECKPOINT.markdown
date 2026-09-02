# ADR-0008 Slice 0 checkpoint

Date: 2026-09-01
Status: **Minimum-packet reset complete locally; no CI or commit**

## Owner reset

Jim determined that planning had become a ratchet and the proposed deployment control plane exceeded Accepted ADR-0008. He approved a minimum implementation using deterministic Git staging, asset-first Static Assets, standard pinned Wrangler deployment, a simple native-metadata baseline guard, ordinary hosted-runner secrets/concurrency, and short human rollback.

The direct API activation helper, split upload/activation protocol, exhaustive response/recovery parsing, credential scanning, automated rollback coordination, and further exact-blob planning loops are removed or deferred. Findings tied only to that abandoned design are superseded by the owner-approved simplification, not silently unresolved.

## Current evidence

- Fresh recovery worktree: detached at `4f84133d5a1561c975e181a915ec28db38b9a659`, clean tracked worktree/index, exactly three untracked internal artifacts.
- Final contract `c01c3e5a08dc3a79011723f4d79c22843774e530` (63 lines) and plan `d9300e5518c65fceb30fdce7a129786cb32ad995` (98 lines). This checkpoint's final identity is recorded in `planning/STATE.md` because it cannot self-record its hash.
- Prior detailed artifacts remain only in disposable packet `/Users/jimcollinson/.local/share/opencode/tool-output/adr-0008-slice0-review-2026-08-31`, manifest `7b8909edbecb420365827f74ab74d75bf8fa3c0b` with 28 source copies. It is reference, not durable or CI evidence.
- Preserved damaged `feat/static-assets` worktree remains untouched.
- Accepted ADR-0008 remains unchanged; the reset must retain ADR-0006 scope, asset-first method behaviour, manual machinery boundary, and honesty rules.

## Telemetry preflight

- Local `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`: absent.
- Wrangler `4.119.0` OAuth: expired; noninteractive refresh unavailable.
- Protected GitHub `production` environment metadata recorded both required secret names; no secret value was read.
- Historical telemetry volume remains inaccessible locally. No authentication or external write was attempted.

## Checks and next step

- Prettier `3.8.4`, ADR governance for 8 ADRs, existing Worker tests 34/34, and tracked/no-index whitespace: passed. Final blob/line/status checks are recorded in `planning/STATE.md`.
- CI: none for uncommitted artifacts; local evidence is weaker.
- No code, runtime, test, package, config, workflow, CI, credential, setting, deployment, commit, push, or PR change occurred in this reset.
- Next authorization is already granted: run a lightweight ADR alignment check, then implement local Slice 1 deterministic staging and focused tests/package invocation without another planning-review loop. Commit/push/PR remain separate checkpoints.
