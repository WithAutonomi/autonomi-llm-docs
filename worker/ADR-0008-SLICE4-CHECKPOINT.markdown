# ADR-0008 Slice 4 checkpoint

Date: 2026-09-02
Status: **Draft PR remediation; review reruns pending**

## Evidence entering remediation

- Previous exact head: `de6ee3a79c8c90854a94de1ce08fbe2bd65833a2`.
- GitHub Actions Worker Check run [33623524205](https://github.com/WithAutonomi/autonomi-llm-docs/actions/runs/33623524205): green for that head.
- Integrated code review: pass. Verifier: 8/8 checks passed.
- Adversarial review: **NOT READY**. It found no mandatory native `main` PR/Worker Check activation precondition, transition-stale root publishing guidance, stale/incomplete durable execution evidence, and a runtime test label that overstated what nonexistent internal `.md` paths proved.

## Bounded dispositions

- Require attended owner verification that native GitHub rules protect `main` through pull requests and the exact **Worker Check** before automatic-publication variables or credentials are set.
- Make the root README distinguish current GitHub Raw serving, the separately protected Static Assets cutover, and later attended automatic-publication activation.
- Mark Slice 0 evidence historical, reconcile only stale plan status/authority wording, and record this concise Slice 4 checkpoint.
- Narrow the runtime test wording to one-fallback behaviour; staging fixture coverage remains the proof of internal-prefix exclusion.

These changes add no production behaviour or machinery. Automatic publication remains inert unless separately activated, and no variables, credentials, repository settings, runtime/config/workflow/baseline/staging behaviour, or live systems are changed.

## Current boundary and backlog

The exact remediated head and its fresh CI result must be recorded in the Draft PR and GitHub checks because a commit cannot self-reference its own SHA. Exact-head adversarial, Craft, and behaviour-complete clean-context review reruns remain pending. There is no merge authorization and no authorization for deployment, publication, Cloudflare authentication, rollback, or any other live action.
