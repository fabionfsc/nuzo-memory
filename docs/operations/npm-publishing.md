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

## Package Lifecycle

Use `@nuzo/memory` as the public runtime package for normal users and host
plugins. It includes the `nuzo`, `nuzo-mcp-server`, and `nuzo-memory-hook`
binaries.

Use `@nuzo/memory-core` for library-level integrations and Nuzo development.

`@nuzo/memory-cli` and `@nuzo/mcp-server` remain published only as transition
packages for users or automation that adopted the earlier split package names.
Version `0.9.0` is their final planned release. It remains version-aligned with
the unified package so existing pre-1.0 users receive the last compatibility
and migration hardening.

After `0.9.0` is published and validated:

- mark every published version of both transition packages deprecated on npm;
- point users to `@nuzo/memory` in the npm deprecation message;
- stop publishing new `@nuzo/memory-cli` and `@nuzo/mcp-server` versions;
- publish `1.0.0` and later releases only for `@nuzo/memory-core` and
  `@nuzo/memory`.

Deprecation changes npm metadata; it does not remove an existing version or
break an installed dependency. Ending public transition-package publication
does not merge the internal CLI, MCP, or core source boundaries.

## Current Release

Version `0.8.1` is the current release:

```text
@nuzo/memory-core@0.8.1
@nuzo/memory@0.8.1
```

The packages are published together from the same source version. Routine
releases should use npm trusted publishing through GitHub Actions OIDC.

## Legacy Deprecation After `0.9.0`

Once the final transition packages and unified replacement have passed
published validation, an authenticated maintainer should run:

```bash
npm deprecate "@nuzo/memory-cli@*" "Deprecated: migrate to @nuzo/memory, which includes the nuzo CLI. Version 0.9.0 is the final compatibility release."
npm deprecate "@nuzo/mcp-server@*" "Deprecated: migrate to @nuzo/memory, which includes nuzo-mcp-server. Version 0.9.0 is the final compatibility release."
```

Verify the registry state:

```bash
npm view @nuzo/memory-cli@0.9.0 deprecated
npm view @nuzo/mcp-server@0.9.0 deprecated
```

Do not run those commands before `0.9.0` is public and its replacement package
has passed the published smoke tests. npm trusted publishing authorizes the
release workflow to publish packages; npm metadata administration may still
require a separately authenticated maintainer session.

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

Do not run `npm publish` from `packages/core`, `packages/cli`, or
`packages/mcp-server`.

Generate publish candidates instead:

```bash
npm run package:npm
```

This creates ignored staging directories and tarballs under:

```text
build/npm/
├── packages/
│   ├── memory-core/
│   ├── memory-cli/
│   └── mcp-server/
└── tarballs/
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
   `memory.recall_hook` against a temporary store.

The command does not publish anything.

## Trusted Publishing

Nuzo publishes through:

```text
.github/workflows/release-npm.yml
```

The workflow is manual-only, runs from `main`, uses the GitHub environment
`npm-publish`, and requests `id-token: write` for npm trusted publishing. It
does not use `NODE_AUTH_TOKEN`.

Configure a trusted publisher for each published package on npmjs.com:

```text
@nuzo/memory-core
@nuzo/memory
@nuzo/memory-cli
@nuzo/mcp-server
```

Use these settings for every package:

```text
Publisher: GitHub Actions
Organization or user: fabionfsc
Repository: nuzo-memory
Workflow filename: release-npm.yml
Environment name: npm-publish
Allowed action: npm publish
```

The workflow installs npm `11.5.1` or newer because trusted publishing requires
OIDC-capable npm. It validates the source release state for one explicit
SemVer input, builds the publish staging packages, rejects already-published
versions, and publishes in dependency order:

```text
@nuzo/memory-core -> @nuzo/memory -> legacy transition packages
```

Run it first with `publish` set to `false`. That dry run proves the workflow
selects the intended version and package set without publishing.

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
3. Confirm the target version does not already exist.
4. Confirm the trusted publisher settings exactly match `fabionfsc`,
   `nuzo-memory`, `release-npm.yml`, and the `npm-publish` environment.
5. Re-run `npm run validate:npm`.
6. Inspect the generated staging package, not the source workspace package.
7. If credentials may have leaked, revoke them before further work.

Never delete or rewrite a published version to repair a failed release. Fix the
problem and publish a new SemVer version.

## Official References

- [Creating an npm organization](https://docs.npmjs.com/creating-an-organization/)
- [Publishing scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
- [Trusted publishing with OIDC](https://docs.npmjs.com/trusted-publishers/)
- [npm access tokens](https://docs.npmjs.com/about-access-tokens/)
