# ADR-0006: Define public serving scope for Markdown paths

- **Status:** Proposed
- **Date:** 2026-06-24
- **Decision owners:** Jim Collinson
- **Reviewers:** Jim Collinson
- **Supersedes:** none
- **Superseded by:** none
- **Related:** ADR-0002 (Worker/GitHub serving); ADR-0003 (`llms.txt`); ADR-0005 (Worker source management); PR #6 (source-controlled Worker deploy config)

## Context

The `autonomi-md-proxy` Worker serves machine-readable documentation from this repository at canonical `autonomi.com` URLs. Its original interception rule treated any path ending in `.md`, plus `/llms.txt` and `/llms-full.txt`, as content that should be fetched from GitHub and returned from the apex domain.

That behaviour is useful because public documentation exists not only at the repository root, but also in subdirectories such as `whitepapers/` and `prompts/`. However, once Worker source and deployment files are brought into this repository, the repo also contains operational material that should not be presented as canonical Autonomi documentation.

The concern is not that operational files are secret. The repository is public. The concern is that anything served from `https://autonomi.com/...` is likely to be interpreted by crawlers, agents, and readers as an official Autonomi documentation page. Operational repository files such as Worker runbooks, GitHub workflow notes, or future issue templates may be useful in GitHub but should not automatically become agent-facing canonical website content.

The repository therefore needs a clear and durable serving policy. Contributors should be able to tell, before merging a file, whether it will be publicly served from `autonomi.com`. The Worker should implement the same policy that the repository documents.

This ADR refines ADR-0002's original broad `.md` interception rule. ADR-0002 remains authoritative for the Cloudflare/GitHub serving architecture; this ADR governs public path scope and internal-prefix exclusions.

## Decision Drivers

- Keep public documentation easy to add through simple Markdown files.
- Preserve existing public Markdown subdirectories such as `whitepapers/` and `prompts/`.
- Avoid presenting operational repository files as canonical Autonomi documentation.
- Avoid one-off filename rules that block legitimate future public pages.
- Make the serving policy understandable to contributors and AI agents.
- Keep the Worker routing logic simple enough to review and test.
- Preserve compatibility with ADR-0002's GitHub-backed Markdown serving model.

## Considered Options

1. Serve every `.md` file in the repository.
2. Exclude specific filenames such as `/README.md`.
3. Serve only root-level `.md` files.
4. Maintain a full allowlist of every public path.
5. Move all public content under a dedicated `content/` directory.
6. Serve `.md` files by default, but exclude internal repository prefixes.

## Decision

We will use a path-based public serving policy.

The Worker may serve the following from GitHub as canonical `autonomi.com` content:

- `.md` files outside internal repository prefixes;
- `/llms.txt`;
- `/llms-full.txt`.

The Worker must not serve files from internal repository prefixes. The initial internal prefixes are:

- `/worker/`;
- `/.github/`.

Requests for internal-prefix paths must fall through to the normal site origin rather than being fetched from GitHub raw content.

We will not special-case `/README.md`. If the team wants a README-style page to be public in the future, it may remain a `.md` file outside an internal prefix. If a document should remain internal, it should live under an internal prefix or use a non-served extension.

The repository README must document the public serving policy so contributors know how to publish content and how to keep operational material internal.

## Consequences

### Positive

- Public documentation remains easy to add: add a `.md` file outside internal prefixes.
- Existing public subdirectory content remains supported.
- Operational Worker files and GitHub automation files are not presented as canonical `autonomi.com` documentation.
- The rule is structural and explainable: public content lives outside internal prefixes.
- Future `/README.md` or `/readme.md` publication remains possible.
- The policy can be tested directly in Worker runtime tests.

### Negative / Trade-offs

- Contributors must remember that `.md` files outside internal prefixes are publishable website content.
- Internal documentation needs an internal path or a non-served extension.
- The initial internal-prefix list may need to grow if new operational directories are added.
- This is less strict than a full allowlist; a mistakenly placed `.md` file outside internal prefixes may still become publicly served.

### Neutral / Operational

- The root README should describe the serving policy and inclusion/exclusion rules.
- The Worker should contain tests for public paths, internal-prefix fallthrough, GitHub 404 fallthrough, and GitHub fetch-error fallthrough.
- Operational docs under `worker/` may use `.md` safely only after the Worker exclusion rule is deployed. During a transition from the older Worker, non-`.md` extensions may be used to avoid an exposure window.
- If the repository later adopts a dedicated public content directory, this ADR should be revisited or superseded.

## Validation

This decision remains valid if:

- `autonomi.com/overview.md` and other intended public `.md` paths continue to serve Markdown content;
- `autonomi.com/llms.txt` and `autonomi.com/llms-full.txt` continue to serve plain text content;
- paths under `/worker/` do not serve GitHub raw content through the Worker;
- paths under `/.github/` do not serve GitHub raw content through the Worker;
- GitHub misses and GitHub fetch errors fall through to the normal site origin;
- the root README documents which paths are public and which paths are internal;
- Worker tests encode the inclusion/exclusion policy.

Review triggers:

- adding a new top-level operational directory;
- adding a new category of public content outside `.md`, `/llms.txt`, or `/llms-full.txt`;
- wanting to make `/worker/` or `/.github/` content public;
- deciding to move public content under a dedicated `content/` directory;
- deciding to replace the prefix policy with a full allowlist.

## Notes for AI-assisted work

AI tools may help draft this ADR, but **must not mark it Accepted without human review**. Accepted ADRs are immutable: create a new superseding ADR rather than editing an Accepted ADR.

AI agents adding Markdown files must check whether the target path is intended to be public. If the file is operational or internal, place it under an internal prefix or use a non-served extension.
