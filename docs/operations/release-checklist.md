# Release Checklist

Use this checklist before tagging a Nuzo release.

Use the complete checklist for every versioned public release.

## Scope

- Confirm the target milestone is complete or intentionally deferred.
- Confirm no `priority:p0` or release-blocking `priority:p1` issues remain open.
- Confirm known non-blockers are documented in GitHub Issues.
- Confirm README, roadmap, and docs describe the actual shipped state.
- Before or immediately after publishing, run a general issue-hunting pass and
  open focused post-release roadmap issues only. Do not expand the release
  scope unless the finding is release-blocking.

Useful commands:

```bash
gh issue list --repo fabionfsc/nuzo-memory --state open --label priority:p0
gh issue list --repo fabionfsc/nuzo-memory --state open --label priority:p1
```

## Workspace

Start from a clean worktree:

```bash
git status --short
```

Confirm a supported runtime is active:

```bash
node --version
npm --version
```

The release baseline is Node.js 22 LTS or 24 LTS with npm 10 or newer. Confirm
that the engine declarations, CI matrix, and
`docs/operations/runtime-support.md` still agree.

Install dependencies from the lockfile:

```bash
npm ci
```

Use `npm install` only when intentionally changing dependencies and reviewing `package-lock.json`.

## Validation

Confirm the CI workflow is green:

```bash
gh run list --repo fabionfsc/nuzo-memory --workflow ci.yml --limit 5
gh run list --repo fabionfsc/nuzo-memory --workflow codeql.yml --limit 5
```

Run:

```bash
npm run check
npm run release:check
npm test
npm run build
npm run benchmark:recall
npm run benchmark:capture
npm run benchmark:capture -- --expect bounded
npm run benchmark:semantics
npm run benchmark:semantics -- --store-size medium
npm run package:plugins
npm run validate:npm
npm run smoke:cli
npm run smoke:host-hooks
npm run smoke:host-canary
npm run smoke:claude-code-plugin
npm run smoke:codex-plugin
NUZO_HOST_CANARY_NATIVE=1 npm run smoke:host-canary
```

For `0.9.0+`, prove local-store integrity and recovery with fake data before
release:

```bash
nuzo memory --store /tmp/nuzo-release/memories.sqlite init
nuzo memory --store /tmp/nuzo-release/memories.sqlite remember \
  "Release backup validation uses fake data only." --kind note --tag release
nuzo memory --store /tmp/nuzo-release/memories.sqlite integrity
nuzo memory --store /tmp/nuzo-release/memories.sqlite backup \
  --path /tmp/nuzo-release/memories.backup.sqlite --overwrite
nuzo memory --store /tmp/nuzo-release/restored.sqlite restore \
  /tmp/nuzo-release/memories.backup.sqlite --yes
nuzo memory --store /tmp/nuzo-release/restored.sqlite integrity
nuzo memory --store /tmp/nuzo-release/restored.sqlite recall "backup validation"
```

The SQLite backup step must use `nuzo memory backup` or an equivalent SQLite
online backup API. Do not validate release recovery by copying only
`memories.sqlite` from a WAL-mode store.

For `0.7.0`, additionally provision the pinned local model in a temporary
location and run the real-provider benchmark and staged optional install:

```bash
node tools/semantic-benchmark.mjs \
  --local-transformers-model /absolute/path/to/pinned-model \
  --similarity-floor 0.34
NUZO_SEMANTIC_MODEL_PATH=/absolute/path/to/pinned-model npm run validate:npm
```

The normal `npm run validate:npm` invocation must prove that Transformers.js
and model files are absent from a default install. The environment-enabled
invocation must install the exact optional peer, rebuild a staged sidecar, and
recall the expected paraphrase through the staged `@nuzo/memory` artifact.
`nuzo memory semantic status` and `semantic provision` must not report `ready`
or skip repair for tampered, truncated, missing, unreadable, or symlinked
pinned model files.

Before `release:prepare`, also run published/package-resolution smokes for the
current release:

```bash
npm run smoke:published:cli
npm run smoke:published:mcp
npm run smoke:published:semantics
```

The plugin artifact smokes use staged npm tarballs before publication while
still validating the generated version-pinned commands. After publishing, run
them against the exact public commands:

```bash
NUZO_PLUGIN_SMOKE_PUBLISHED=1 npm run smoke:host-canary
NUZO_PLUGIN_SMOKE_PUBLISHED=1 npm run smoke:claude-code-plugin
NUZO_PLUGIN_SMOKE_PUBLISHED=1 npm run smoke:codex-plugin
```

The published host canary sets npm's internal log level to `error` for its
version-pinned `npm exec` hook subprocesses. This prevents non-fatal dependency
warnings from being mistaken for hook failures while preserving strict failure
on a non-zero hook status or hook stderr.

The `smoke:published:*` commands resolve the current target from npm and are
expected to fail until that version is published. Run them again after
publishing the target packages. The optional-semantics published smoke always
validates the default no-model fallback and package boundary. To require a real
local semantic rebuild and recall against the exact published package, run:

```bash
NUZO_SEMANTIC_MODEL_PATH=/absolute/path/to/pinned-model \
  npm run smoke:published:semantics -- --require-model
```

For `0.6.0`, keep a release-gate note with the command output or CI links that
prove:

- the capture benchmark records the `0.5.0` baseline profile and the bounded
  `0.6.0` profile;
- English relationship quality fails independently from other languages;
- policy blocks, scope isolation, archived isolation, candidate/output bounds,
  zero memory writes, zero audit writes, and revision conflicts pass;
- staged CLI, MCP, Codex, and Claude Code flows all use explicit
  `memory.confirm_capture` decisions for capture confirmation.

Confirm the generated host artifacts contain no monorepo runtime paths:

```bash
rg -n '\.\./mcp-server|packages/mcp-server' build/plugins
```

The command should return no matches.

Confirm the target `@nuzo/memory-core` and `@nuzo/memory` versions are not
already published before publishing. After publishing, `@nuzo/memory` must
exist before shipping the plugin artifacts.

Follow `docs/operations/npm-publishing.md`. Confirm the `@nuzo` organization
scope and maintainer access before changing source package privacy or running
any publish command.

Confirm npm trusted publishing is configured for each package that the target
release will publish.

For `0.9.0`, confirm:

```text
@nuzo/memory-core
@nuzo/memory
@nuzo/memory-cli
@nuzo/mcp-server
```

For `1.0.0` and later routine releases, confirm:

```text
@nuzo/memory-core
@nuzo/memory
```

All package settings must point to GitHub Actions, repository
`fabionfsc/nuzo-memory`, workflow `release-npm.yml`, environment
`npm-publish`, and allowed action `npm publish`.

Build docs strictly:

```bash
python3 -m venv .venv-docs
.venv-docs/bin/pip install -r requirements-docs.txt
.venv-docs/bin/mkdocs build --strict
```

Check dependency state:

```bash
npm ls --depth=0
npm audit --audit-level=moderate
npm audit signatures
```

Confirm repository security automation is active:

- Dependabot alerts and security updates are enabled.
- Dependabot config covers npm, GitHub Actions, and Python docs dependencies.
- CodeQL runs on pushes, pull requests, and the weekly scheduled scan.
- Secret scanning and push protection remain enabled.
- Branch protection applies to administrators and requires pull requests for
  routine changes.
- Required Node.js 22, Node.js 24, documentation, and CodeQL checks use strict
  current-branch validation.

## Clean Install

Run the clean install walkthrough:

```text
docs/getting-started/clean-install.md
```

Use fake data only.

If `better-sqlite3` falls back to a native build, validate the documented
platform toolchain path in `docs/operations/runtime-support.md`.

## `0.9.0` Legacy Package Cutoff

For the `0.9.0` release only:

1. Publish and validate `@nuzo/memory-core`, `@nuzo/memory`,
   `@nuzo/memory-cli`, and `@nuzo/mcp-server` at exactly `0.9.0`.
2. Confirm the unified package exposes `nuzo`, `nuzo-mcp-server`, and
   `nuzo-memory-hook` and passes the published CLI/MCP smokes.
3. Confirm the transition-package npm READMEs identify `@nuzo/memory` as the
   replacement and `0.9.0` as their final release.
4. Only then apply the two npm deprecation messages documented in
   [npm Publishing](npm-publishing.md#legacy-deprecation-after-090).
5. Verify npm reports both transition packages as deprecated and record the
   registry evidence in post-release validation.

Deprecation is a post-publication metadata action. Do not perform it during a
dry run, rehearsal, or before the unified `0.9.0` replacement is available.

For `1.0.0` and later:

1. Confirm `npm run package:npm`, `npm run validate:npm`, and the npm release
   workflow stage only `@nuzo/memory-core` and `@nuzo/memory`.
2. Confirm `build/npm/packages/memory-cli/package.json` and
   `build/npm/packages/mcp-server/package.json` are absent.
3. Treat any retired transition package in staging as a release blocker.

## Security And Sanitization

Before tagging, confirm no runtime memory, generated files, or credentials are staged:

```bash
git status --short
git ls-files | rg '(^site/|/dist/|^dist/|^node_modules/|\.sqlite|memory\.export|\.env)'
```

Expected tracked output is empty. Public documentation and test fixtures must
continue to use fake data only.

Remove generated artifacts before committing:

```bash
rm -rf site packages/core/dist packages/cli/dist packages/mcp-server/dist
```

Do not commit runtime memory stores, real memory exports, `.env` files, credentials, private user data, dependency caches, or generated docs/build output.

## Version And Changelog

Follow:

```text
docs/operations/versioning.md
docs/operations/release-version-map.md
```

Before tagging:

- rehearse the target with `npm run release:rehearse -- X.Y.Z`;
- optionally run the CI workflow manually with the same release rehearsal version;
- always provide an explicit future version to the manual workflow; it has no
  default target and rejects a changelog version that already exists;
- keep workflow inputs in environment variables and quote them in shell
  commands; do not interpolate user-controlled dispatch inputs directly;
- move relevant `CHANGELOG.md` entries from `[Unreleased]` into the target version section;
- keep a fresh empty `[Unreleased]` section above the release section;
- prepare the release version with `npm run release:prepare -- X.Y.Z`;
- confirm `npm run release:check -- X.Y.Z` passes;
- confirm public release references in `docs/operations/release-version-map.md`
  are still complete;
- review `package.json`, workspace package versions, host plugin manifests, source version strings, and `package-lock.json`;
- commit the version bump as a release commit.

Do not bump versions for ordinary development commits.

The synthetic changelog section used during rehearsal is not release notes and
does not replace the real changelog edit required for the release commit.

## GitHub Pages

Confirm the docs workflow is green:

```bash
gh run list --repo fabionfsc/nuzo-memory --limit 5
```

Confirm the public docs URLs:

```bash
curl -I https://fabionfsc.github.io/nuzo-memory/
curl -I http://nuzo.com.br/
```

When GitHub finishes custom-domain certificate issuance, also confirm:

```bash
curl -I https://nuzo.com.br/
```

If HTTPS is still not enforced, keep the GitHub Pages HTTPS issue open and mention it in release notes if the release depends on the custom domain.

## Tag And Publish

After validation and version bump:

```bash
git diff --check
git status --short
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

Create GitHub release notes from `CHANGELOG.md`.

Run the npm release workflow from `main` with the exact package version and
`publish=false` first. Confirm it selects the intended version and packages
without using an npm token.

After the dry run passes and the Git tag/release is ready, run the same
workflow with `publish=true`. Confirm the npm package pages show provenance
for the new version.

## Post-Release

- Confirm the GitHub release page is correct.
- Confirm GitHub Pages still deploys successfully.
- Confirm the matching `@nuzo/memory-core` and `@nuzo/memory` versions are
  published.
- Open follow-up issues for deferred work.
- Move `CHANGELOG.md` back to an empty `[Unreleased]` section for new development.
