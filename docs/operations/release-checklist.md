# Release Checklist

Use this checklist before tagging a Nuzo release.

Nuzo has a public `0.1.0` MVP release. Use this checklist for every subsequent
versioned release.

## Scope

- Confirm the target milestone is complete or intentionally deferred.
- Confirm no `priority:p0` or release-blocking `priority:p1` issues remain open.
- Confirm known non-blockers are documented in GitHub Issues.
- Confirm README, roadmap, and docs describe the actual shipped state.

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
npm run package:plugins
npm run validate:npm
npm run smoke:cli
```

Confirm the generated host artifacts contain no monorepo runtime paths:

```bash
rg -n '\.\./mcp-server|packages/mcp-server' build/plugins
```

The command should return no matches.

Confirm the matching `@nuzo/memory-core`, `@nuzo/memory-cli`, and
`@nuzo/mcp-server` versions are published. The MCP package must exist before
shipping the plugin artifacts.

Follow `docs/operations/npm-publishing.md`. Confirm the `@nuzo` organization
scope and maintainer access before changing source package privacy or running
any publish command.

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
- The `main` branch protection or repository rules are intentional and include
  the required release checks for non-maintainer changes.

## Clean Install

Run the clean install walkthrough:

```text
docs/getting-started/clean-install.md
```

Use fake data only.

If `better-sqlite3` falls back to a native build, validate the documented
platform toolchain path in `docs/operations/runtime-support.md`.

## Security And Sanitization

Before tagging, confirm no runtime memory, generated files, or credentials are staged:

```bash
git status --short
git ls-files | rg '(^site/|/dist/|^dist/|^node_modules/|\.sqlite|memory\.export|\.env)'
```

Expected tracked match today:

```text
examples/memory.export.example.md
```

That file must remain fake/example data only.

Remove generated artifacts before committing:

```bash
rm -rf site packages/core/dist packages/cli/dist packages/mcp-server/dist
```

Do not commit runtime memory stores, real memory exports, `.env` files, credentials, private user data, dependency caches, or generated docs/build output.

## Version And Changelog

Follow:

```text
docs/operations/versioning.md
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

## Post-Release

- Confirm the GitHub release page is correct.
- Confirm GitHub Pages still deploys successfully.
- Open follow-up issues for deferred work.
- Move `CHANGELOG.md` back to an empty `[Unreleased]` section for new development.
