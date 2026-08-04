# Autonomi LLM Documentation

Machine-readable documentation for the Autonomi Network, designed to help AI assistants understand and explain the platform to developers.

## What This Is

This repository contains:

- **llms.txt** - Main index file following the [llms.txt standard](https://llmstxt.org/)
- **Markdown documentation** - Clean, comprehensive content about Autonomi's architecture, features, and developer experience
- **Page variants** - `.md` versions of key autonomi.com pages for AI consumption
- **Cloudflare Worker config** - Source-controlled Worker code/config in [`worker/`](worker/README.markdown), with manual deployment workflows documented in the Worker runbook

## How It Works

Content in this repo is served at `autonomi.com` via Cloudflare Worker.

Files appear to live on autonomi.com but are actually served from this GitHub repo, giving us:
- Version control for all LLM documentation
- Easy collaborative editing
- Single source of truth
- Clean content without HTML wrappers

## Public Serving Policy

The Cloudflare Worker serves `.md`, `/llms.txt`, and `/llms-full.txt` from this repo at canonical `autonomi.com` URLs, except for internal repository prefixes.

Public by default:

- `.md` files outside internal prefixes
- `/llms.txt`
- `/llms-full.txt`

Internal prefixes not served from GitHub raw content:

- `/worker/`
- `/.github/`

To publish machine-readable content, add a `.md` file outside the internal prefixes. To keep operational or repository-internal documentation out of canonical `autonomi.com` serving, place it under an internal prefix or use a non-served extension. See ADR-0006 for the decision record.

## Publishing and Managing Content

This repo is for machine-readable, LLM-parsable, AI-optimised content served from the `autonomi.com` domain.

It provides Markdown/plain-text versions of key `autonomi.com` pages, and any other content the team wants available at stable `autonomi.com` URLs. These files are maintained in GitHub in parallel with the human-readable HTML pages managed in Framer.

For pages that have a Markdown counterpart in this repo, the `.md` URL is the LLM-friendly version of the page. For example, a human-facing page on `autonomi.com` can have a Markdown counterpart such as `https://autonomi.com/overview.md` when `overview.md` exists in this repository.

This repo also provides:

- `llms.txt`: a concise index for AI assistants and crawlers
- `llms-full.txt`: a fuller context file for AI assistants that want more inline detail
- Markdown versions of selected public pages and reference material
- foundational whitepapers in both Markdown and PDF form
- source-controlled Worker code/config for serving the content at `autonomi.com`

For a normal content update:

1. Edit the existing public content file, or add a new public `.md` file outside internal prefixes.
2. Update `llms.txt` so it includes every public content URL that should be discoverable.
3. Update `llms-full.txt` so it reflects the current public content set and messaging.
4. Open a PR.
5. Review the Markdown and the final `autonomi.com` URL it will map to.
6. Merge the PR to `main`.
7. Check the live URL after merge if needed.

After a content PR is merged to `main`, the Cloudflare Worker serves the updated content automatically from GitHub raw content. There is usually no separate deployment step for content-only changes. Served documentation responses use `Cache-Control: public, max-age=300`, so changes may take up to about five minutes to appear at `autonomi.com`.

When public content is added, removed, renamed, or substantially changed:

- add new public URLs to `llms.txt`
- remove deleted public URLs from `llms.txt`
- update `llms-full.txt` to match the current content and messaging
- check whether the content should be linked from an existing section or whether a new section is needed
- keep URLs stable where possible, because agents and external tools may cache or reference them

Public content is served when it matches one of these rules:

- `.md` files outside internal prefixes
- `/llms.txt`
- `/llms-full.txt`

Examples:

- `overview.md` is served at `https://autonomi.com/overview.md`
- `whitepapers/autonomous-network.md` is served at `https://autonomi.com/whitepapers/autonomous-network.md`
- `llms.txt` is served at `https://autonomi.com/llms.txt`
- `llms-full.txt` is served at `https://autonomi.com/llms-full.txt`

### Whitepapers

Foundational whitepapers are kept in two forms:

- Markdown versions for LLM-readable content served from `autonomi.com`
- PDF versions for stable, shareable, human-readable original documents

When adding or updating a whitepaper:

1. Keep the Markdown version under `whitepapers/`.
2. Keep the corresponding PDF in the same directory when a PDF counterpart exists.
3. For whitepapers that have a PDF counterpart, link from the Markdown page to the PDF using an explicit GitHub raw URL.
4. Add or update the Markdown URL in `llms.txt`.
5. Update `llms-full.txt` so the whitepaper set and summary remain current.

The Worker does not currently serve `.pdf` files from `autonomi.com`. Whitepaper PDF links should use explicit GitHub raw URLs, for example:

`https://raw.githubusercontent.com/WithAutonomi/autonomi-llm-docs/main/whitepapers/Autonomous-Network.pdf`

Do not use relative PDF links such as `Autonomous-Network.pdf` from a served Markdown page, because that would resolve against `autonomi.com` and fall through to Framer rather than serving the file from this repo.

Under the current policy, any `.md` file outside internal prefixes can be served from `autonomi.com`. This includes repo-level and governance Markdown such as `README.md` and `docs/adr/*.md`; those files are intentionally visible as public repository context.

Operational or maintenance material that should not be published as canonical Autonomi documentation should live under an internal prefix, or use a non-served extension such as `.markdown`.

Internal prefixes not served from GitHub raw content:

- `/worker/`
- `/.github/`

Use internal locations for:

- Worker source and runbooks
- GitHub workflow files or workflow documentation
- repository-maintenance notes
- operational material that is useful in GitHub but should not appear as public `autonomi.com` documentation

Changing content is different from changing serving behaviour.

Content-only changes normally need only a PR merge. Worker or serving-policy changes need additional review and, after merge, a manual Worker deployment. For Worker changes, follow the `worker/README.markdown` runbook: deploy preview, approve the required environment review, smoke test the workers.dev URL, deploy production, approve the required environment review, and smoke test `autonomi.com`. Treat these as serving changes:

- editing `worker/src/index.js`
- changing Wrangler config
- changing deploy workflows
- adding new public file types beyond `.md`, `/llms.txt`, or `/llms-full.txt`
- serving PDFs from `autonomi.com` instead of GitHub raw URLs
- changing internal prefixes or routing policy
- changing cache behaviour or response headers

Serving-policy changes should be reflected in Worker tests and checked against ADR-0006. PDF-linking behaviour is documented in ADR-0004 and should be revisited if the Worker is changed to serve PDFs directly from `autonomi.com`.

## Who This Is For

**Primary audience:** AI assistants (Claude, ChatGPT, etc.) helping developers build on Autonomi

**Secondary audience:** Developers who want clean, comprehensive technical documentation

## Contributing

This repo is maintained by the Autonomi team. Content should be:

- Written in clear, accessible markdown
- Comprehensive enough for AI assistants to guide developers and inform those wishing to understand the technology
- Free of HTML or formatting that would confuse machine readers

## Related

- [Autonomi Website](https://autonomi.com)
- [Developer Documentation](https://docs.autonomi.com)
- [llms.txt Standard](https://llmstxt.org/)
