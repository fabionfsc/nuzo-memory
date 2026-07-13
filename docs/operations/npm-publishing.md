# npm Publishing

Nuzo's host plugins resolve the shared runtime from:

```text
@nuzo/memory
```

The unified package depends on:

```text
@nuzo/memory-core
```

Core and unified packages use the same version and must be released together.
`@nuzo/memory-cli` and `@nuzo/mcp-server` are legacy transition packages.

Starting with `1.1.0`, `@nuzo/memory-mcp` is the single-entrypoint npm
distribution referenced by the official MCP Registry. It packages the same
MCP server output and depends on the same exact `@nuzo/memory-core` version; it
does not introduce another implementation or replace `@nuzo/memory` for normal
installation.

## Package Lifecycle

Use `@nuzo/memory` as the public runtime package for normal users and host
plugins. It includes the `nuzo`, `nuzo-mcp-server`, and `nuzo-memory-hook`
binaries.

Use `@nuzo/memory-core` for library-level integrations and Nuzo development.

`@nuzo/memory-cli` and `@nuzo/mcp-server` remain published only as transition
packages for users or automation that adopted the earlier split package names.
Version `0.9.0` was their final public release. It remains version-aligned
with the unified package so existing pre-1.0 users received the last
compatibility and migration hardening.

After the validated `0.9.0` publication, maintainers completed the transition:

- mark every published version of both transition packages deprecated on npm;
- point users to `@nuzo/memory` in the npm deprecation message;
- stop publishing new `@nuzo/memory-cli` and `@nuzo/mcp-server` versions;
- keep later active packages separate from the retired transition names;
  `@nuzo/memory-mcp` joins the active set at `1.1.0` solely as the
  single-entrypoint Registry distribution.

Deprecation changes npm metadata; it does not remove an existing version or
break an installed dependency. Ending public transition-package publication
does not merge the internal CLI, MCP, or core source boundaries.

Release tooling derives staging, target checks, and publishing order from
`tools/npm-package-policy.mjs`. The policy intentionally includes all four
packages through `0.9.0`, then omits the two transition packages for every
version after `0.9.0`. Post-`0.9.0` publish checks fail if a retired transition
package is still present in `build/npm/packages/`.

## Current Release

Version `1.1.0` is the current release:

```text
@nuzo/memory-core@1.1.0
@nuzo/memory@1.1.0
@nuzo/memory-mcp@1.1.0
```

The packages are published together from the same source version. Routine
releases should use npm trusted publishing through GitHub Actions OIDC.

## Legacy Deprecation State

The final transition packages are deprecated on npm. Keep the registry state
aligned with these messages:

```bash
npm deprecate "@nuzo/memory-cli@*" "Deprecated: migrate to @nuzo/memory, which includes the nuzo CLI. Version 0.9.0 is the final compatibility release."
npm deprecate "@nuzo/mcp-server@*" "Deprecated: migrate to @nuzo/memory, which includes nuzo-mcp-server. Version 0.9.0 is the final compatibility release."
```

Verify the registry state during release readiness checks:

```bash
npm view @nuzo/memory-cli@0.9.0 deprecated
npm view @nuzo/mcp-server@0.9.0 deprecated
```

npm trusted publishing authorizes the release workflow to publish packages;
npm metadata administration may still require a separately authenticated
maintainer session if the deprecation metadata must be repaired.

## Scope Ownership

The preferred public scope is `@nuzo`.

An npm organization named `nuzo` must exist and the release maintainer must
have publishing access before the first release. An `E404` from `npm view`
only confirms that a package is not currently public; it does not prove that
the organization scope is available or owned by the project.

Confirm interactively:

```bash
npm login
npm whoami
npm org ls nuzo
```

Do not change public package names until the scope decision is durable. Package
names become part of the public API after release.

## Source Protection

The source workspace packages remain:

```json
{
  "private": true
}
```

Do not run `npm publish` from any source workspace, including
`packages/core`, `packages/cli`, `packages/mcp-server`, or
`packages/registry-server`.

Generate publish candidates instead:

```bash
npm run package:npm
```

This creates ignored staging directories and tarballs under:

```text
build/npm/
├── artifact-manifest.json
├── packages/
│   ├── memory-core/
│   ├── memory-cli/
│   ├── memory/
│   └── mcp-server/
└── tarballs/
```

For `1.0.x`, generated staging contains only:

```text
build/npm/
├── packages/
│   ├── memory-core/
│   └── memory/
└── tarballs/
```

Starting with `1.1.0`, staging additionally contains:

```text
build/npm/packages/memory-mcp/
build/npm/tarballs/nuzo-memory-mcp-X.Y.Z.tgz
```

The staging process:

- removes `private` only from generated package metadata;
- removes development scripts and dependencies;
- pins the unified package, CLI legacy package, and MCP legacy package to the
  exact core version;
- rejects local `file:`, `link:`, `workspace:`, relative, or absolute
  dependency references;
- copies runtime output, README, and Apache-2.0 license;
- rejects tests, source files, databases, exports, secrets, and environment files.
- records every tarball's npm SRI, SHA-256, byte size, and source commit in
  `artifact-manifest.json`, then verifies the manifest against the generated
  bytes before returning success.

## Validation

Run:

```bash
npm run validate:npm
```

The validation:

1. rebuilds from clean `dist` directories;
2. creates npm tarballs with `npm pack`;
3. installs all tarballs into a temporary project;
4. confirms package versions match;
5. runs the installed `nuzo` binary through init, remember, suggest-capture,
   confirmed capture create/update/reject/conflict paths, recall, list,
   duplicate detection, and doctor;
6. verifies installed CLI operational, usage, and internal exit-code contracts;
7. connects an SDK client to the installed `nuzo-mcp-server` binary over stdio;
8. verifies the exact public tool set, calls `memory.doctor`, and exercises
   `memory.suggest_capture`, `memory.confirm_capture`, and
   `memory.recall_hook` against a temporary store;
9. validates the Registry package's canonical `mcpName`, single bin, exact
   core pin, and MCP session continuity through the installed `memory-mcp`
   entrypoint.

The command does not publish anything.

## Trusted Publishing

Nuzo publishes through:

```text
.github/workflows/release-npm.yml
```

The workflow is manual-only, runs from `main`, uses the GitHub environment
`npm-publish`, and requests `id-token: write` for npm trusted publishing. It
does not use `NODE_AUTH_TOKEN`.

Configure a trusted publisher for each package that the target release will
publish on npmjs.com.

For `0.9.0`, that is:

```text
@nuzo/memory-core
@nuzo/memory
@nuzo/memory-cli
@nuzo/mcp-server
```

For `1.0.x`, that is:

```text
@nuzo/memory-core
@nuzo/memory
```

Starting with `1.1.0`, also configure the same trusted publisher for:

```text
@nuzo/memory-mcp
```

The package is new in `1.1.0`. npm requires a package to exist before its
trusted publisher can be configured, and staged publishing cannot bootstrap a
brand-new package. For `1.1.0` only, the publish tool deliberately defers
`@nuzo/memory-mcp` in live mode. Publish core and unified memory through OIDC,
then perform one authenticated first publication of the exact retained
`nuzo-memory-mcp-1.1.0.tgz` candidate from the reviewed dry-run workflow.
Configure its trusted publisher immediately afterward. Do not add an npm token
to the release workflow.

The dry run retains `artifact-manifest.json` and all three tarballs for 14 days
under an artifact named `nuzo-npm-<version>-<commit>`. Record the manifest
SHA-256 printed by the workflow and supply it as `artifact_manifest_sha256`
when running the same workflow with `publish=true`. The publish run rebuilds
the candidates from `main` and fails unless its manifest is byte-identical to
the reviewed dry run.

After the OIDC workflow has published `@nuzo/memory-core@1.1.0`, download the
reviewed dry-run artifact and verify it from the exact release checkout:

```bash
NUZO_NPM_CANDIDATE=/tmp/nuzo-npm-1.1.0
rm -rf "$NUZO_NPM_CANDIDATE"
gh run download <dry-run-id> \
  --name "nuzo-npm-1.1.0-<full-commit>" \
  --dir "$NUZO_NPM_CANDIDATE"
node tools/verify-npm-artifact-manifest.mjs \
  1.1.0 <reviewed-manifest-sha256> "$NUZO_NPM_CANDIDATE"
npm publish \
  "$NUZO_NPM_CANDIDATE/tarballs/nuzo-memory-mcp-1.1.0.tgz" \
  --access public
node tools/check-npm-publish-targets.mjs \
  1.1.0 "$NUZO_NPM_CANDIDATE/tarballs"
```

Run it only after `npm login`, target availability checks, the bound OIDC
workflow, and all release gates pass. Do not rebuild the manual package or
publish its staging directory.

The authenticated local bootstrap cannot produce GitHub Actions npm
provenance. `@nuzo/memory-mcp@1.1.0` is the one documented exception: its
retained manifest, workflow run, tarball SHA-256, and public `dist.integrity`
are the evidence chain. Core and unified memory still require OIDC provenance.
Configure trusted publishing immediately so `1.1.1` and later have normal npm
provenance for all active packages.

Use these settings for every package:

```text
Publisher: GitHub Actions
Organization or user: fabionfsc
Repository: nuzo-memory
Workflow filename: release-npm.yml
Environment name: npm-publish
Allowed action: npm publish
```

The workflow installs the reviewed exact npm version `11.5.1` because trusted
publishing requires OIDC-capable npm. Bump that version only through a reviewed
pull request that keeps `npm run check:supply-chain` green. The workflow
validates the source release state for one explicit SemVer input, builds the
publish staging packages, rejects already-published versions, rejects retired
legacy staging after `0.9.0`, and publishes in dependency order:

```text
@nuzo/memory-core -> @nuzo/memory -> @nuzo/memory-mcp
```

The legacy transition suffix applies only through `0.9.0`; later releases use
the active-package order shown above. The one-time `1.1.0` manual bootstrap is
the only exception.

Run it first with `publish` set to `false`. That dry run proves the workflow
selects the intended version and package set without publishing, prints the
reviewed manifest SHA-256, and retains the exact candidates. A live run must
provide that SHA-256 and fails closed if rebuilt bytes differ.

When `publish` is `true`, the workflow runs:

```bash
npm publish --access public --provenance
```

Trusted publishing should attach npm provenance to the release and remove the
normal need for a long-lived npm token. Keep any maintainer token only as an
emergency fallback, with expiration and local storage controls documented in
machine-local notes.

## First Publication

Do not publish version `0.0.0`. Follow the release checklist and move all Nuzo
packages and plugin manifests to the first release version together.

Publish in dependency order:

```bash
cd build/npm/packages/memory-core
npm publish --access public

cd ../memory
npm publish --access public

cd ../memory-cli
npm publish --access public

cd ../mcp-server
npm publish --access public
```

This manual first-publication sequence is historical and applies only to the
pre-`1.1.0` transition set. Do not use it as the package list for `1.1.0` or
later releases.

Verify before distributing host plugins:

```bash
npm view @nuzo/memory-core@<version> version
npm view @nuzo/memory@<version> version
NUZO_VERIFY_DIR=/tmp/nuzo-published-verify
rm -rf "$NUZO_VERIFY_DIR"
npm install --prefix "$NUZO_VERIFY_DIR" @nuzo/memory@<version>
NUZO_DOCTOR_SKIP_GIT=1 "$NUZO_VERIFY_DIR/node_modules/.bin/nuzo" memory doctor
test -x "$NUZO_VERIFY_DIR/node_modules/.bin/nuzo-mcp-server"
rm -rf "$NUZO_VERIFY_DIR"
```

The first publication was performed by an authenticated maintainer. Future
routine versions should use the trusted publishing workflow above.

## Credentials

Never commit:

- `.npmrc` containing credentials;
- `NODE_AUTH_TOKEN`;
- npm access tokens;
- 2FA recovery codes;
- npm debug logs containing authentication context.

If a token is used temporarily:

1. create a granular token with the narrowest package access and expiration;
2. store it only in the approved secret store;
3. revoke it immediately if exposed or no longer required;
4. remove local credential files after use.

Prefer trusted publishing now that the initial packages and publisher
relationship exist.

## Recovery

If publication fails:

1. Stop before retrying with broader credentials.
2. Check `npm whoami` and organization membership.
3. If the target version exists, compare its `dist.integrity` with the retained
   reviewed tarball; never skip or combine a divergent immutable package.
4. Confirm the trusted publisher settings exactly match `fabionfsc`,
   `nuzo-memory`, `release-npm.yml`, and the `npm-publish` environment.
5. Re-run `npm run validate:npm`.
6. Inspect the retained tarball and `artifact-manifest.json`, not the source
   workspace package or a rebuilt staging directory.
7. If credentials may have leaked, revoke them before further work.

Never delete or rewrite a published version to repair a failed release. Fix the
problem and publish a new SemVer version.

## Official References

- [Creating an npm organization](https://docs.npmjs.com/creating-an-organization/)
- [Publishing scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
- [Trusted publishing with OIDC](https://docs.npmjs.com/trusted-publishers/)
- [npm access tokens](https://docs.npmjs.com/about-access-tokens/)
