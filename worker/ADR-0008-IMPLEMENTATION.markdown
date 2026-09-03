# ADR-0008 implementation contract

This is the minimum build contract for Accepted ADR-0008. ADR-0006 remains authoritative for public paths and ADR-0005 for repository-managed Worker machinery, as refined by ADR-0008. Git is the source of truth.

## Deterministic asset staging

`deterministic asset staging` takes one explicit Git commit and builds disposable `worker/.staged-assets/`. It never reads document bytes from the worktree or index and never generates or transforms document content.

- Resolve the supplied treeish once to an original commit. Inventory recursively with NUL-delimited Git plumbing and `--no-replace-objects`; read each admitted blob by object ID.
- Select exact-suffix `.md` outside first path segments `worker` and `.github`, plus exact root `llms.txt` and `llms-full.txt`, matching ADR-0006 case-sensitively.
- A selected-looking entry must be a regular Git blob mode `100644` or `100755`. Unsafe type, mode, duplicate, malformed path, unreadable object, or partial inventory fails the whole run.
- Selected paths must be valid UTF-8, relative, slash-separated, normalized NFC paths without empty/`.`/`..` segments, backslash, NUL/control/format/bidi characters, literal query/fragment delimiters, or percent-octet forms. Do not silently skip an unsafe selected path.
- Each ordinary asset is at most 26,214,400 bytes and the set is at most 20,000 paths. Reject selected collisions with root `.assetsignore`, `_headers`, or `_redirects`; root-relative `_worker.js` prefix forms; and first segment `cdn-cgi`.
- Build a fresh temporary sibling, verify its complete inventory, then replace `.staged-assets`. Failed builds expose no partial output. Final output contains exactly admitted bytes plus one generated root `_headers`; no manifest or persistent state is written.
- `_headers` is this fixed UTF-8/LF literal, including one final newline:

  ```text
  /*.md
    Content-Type: text/markdown; charset=utf-8
    Cache-Control: public, max-age=300

  /llms.txt
    Content-Type: text/plain; charset=utf-8
    Cache-Control: public, max-age=300

  /llms-full.txt
    Content-Type: text/plain; charset=utf-8
    Cache-Control: public, max-age=300
  ```

## Static Assets and Worker behaviour

- Production and preview Wrangler configs declare `.staged-assets`, `html_handling: "none"`, `not_found_handling: "none"`, and asset-first routing (`run_worker_first: false`) with no assets binding.
- Matching assets serve exact staged bytes for `GET` and bodyless `HEAD`. `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS` routed to a matching asset return `405 Method Not Allowed`. Matching requests do not invoke the user Worker or Framer.
- A non-asset request invokes the user Worker once; the Worker performs one unchanged fallthrough to Framer. There is no runtime GitHub request, content fallback, or fallback telemetry.
- Production preserves Worker `autonomi-md-proxy`, route `autonomi.com/*`, compatibility date, workers.dev setting, and declared observability. Preview uses `autonomi-md-proxy-preview`, workers.dev only, and no production route. The reviewed config is authoritative for assets and all Worker settings.

## Standard deployment boundary

- Use pinned repository Wrangler and ordinary `wrangler deploy` only. The reviewed target pairs are preview config/name `worker/wrangler.preview.jsonc` / `autonomi-md-proxy-preview` and production config/name `worker/wrangler.jsonc` / `autonomi-md-proxy`.
- Workflows run on fresh GitHub-hosted `ubuntu-latest` runners. Exact named `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets are exposed only to the deploy step. Do not add a credential scrubber, profile scanner, or alternate deployment client.
- Platform, account, credential scope/storage, live settings, and deployment-result uncertainties stop at an attended checkpoint. Do not pre-build a direct Cloudflare API activation helper, separate upload/activation protocol, exhaustive response/recovery parser, or automatic rollback.

## Baseline guard and automatic synchronization

- A protected manual machinery deployment establishes the latest reviewed baseline commit and records its identity in native deployment metadata. Git and Cloudflare deployment history are the only records.
- Machinery is `worker/**`, `.github/workflows/**`, and `.github/actions/**`. Automatic publication is allowed only when those paths are identical between the recorded baseline commit and network-current `main`.
- One automatic workflow runs on every safe `main` push without content path filters. Under shared production concurrency with `cancel-in-progress: false`, it rechecks that remote `refs/heads/main` equals checked-out `HEAD`/`github.sha`, stages the complete ADR-0006 set, and deploys it with the exact production config/name.
- Missing, malformed, ambiguous, stale, or non-ancestor baseline/current identity and any machinery drift stop before deployment. Serving-machinery changes use the protected manual path.
- Native annotations may record baseline and source commit identity. They are operator evidence, not cryptographic or live-byte proof. Add no custom state, database, controller, manifest, live-asset comparison, atomic interlock, or orchestration retry system.
- Repository-driven production writes share one GitHub concurrency group. For rare dashboard rollback, a human pauses/cancels visible publication, confirms it is quiet, rolls back, verifies, reconciles intended state to Git/manual baseline, then resumes. Do not automate run scanning or rollback coordination.

## Acceptance tests

- Staging fixtures cover add/update/delete/rename, recursive selection/exclusion, exact modes and arbitrary bytes, explicit-commit isolation from worktree/index, repeatability, unsafe selected paths/types, reserved names, size/count boundaries, fresh replacement, failure cleanup, and an independent exact `_headers` oracle.
- Integrated pinned-Wrangler tests exercise real Static Assets routing: asset `GET`/`HEAD`, the five routed `405` methods, internal/PDF/missing paths, control-file non-exposure, and exactly one non-asset Worker fallthrough.
- Config/static checks prove exact target names, production route/settings preservation, preview isolation, `.staged-assets`, asset-first options, pinned Wrangler, GitHub-hosted runners, step-scoped exact secret names, and shared production concurrency.
- Baseline-guard fixtures allow unchanged machinery with any complete safe public set and reject machinery drift, stale/current-main mismatch, absent or malformed native identity, and unsafe staging input.
- Repository inspection proves there is no runtime GitHub fetch, custom deployment state, direct activation API helper, credential scanner, automatic rollback coordinator, or generic deployment target input.

## Stop conditions

Stop rather than add machinery if implementation conflicts with Accepted ADR-0005, ADR-0006, or ADR-0008; standard pinned Wrangler cannot express the required routing/config/deploy behaviour; a new dependency or architecture is needed; platform limits differ; or live evidence/authorization is required. Gate, CI, harness, build, environment, credential, setting, PR, merge, and deployment changes occur only in their named approved slices or attended checkpoints.
