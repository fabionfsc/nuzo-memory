# npm Publishing

Nuzo's host plugins resolve the shared runtime from:

```text
@nuzo/mcp-server
```

The MCP package depends on:

```text
@nuzo/memory-core
```

The CLI package also depends on:

```text
@nuzo/memory-core
```

Core, CLI, and MCP packages use the same version and must be released together.

## Current Release

Version `0.1.1` is the current release target:

```text
@nuzo/memory-core@0.1.1
@nuzo/memory-cli@0.1.1
@nuzo/mcp-server@0.1.1
```

The first publication used maintainer authentication. Subsequent routine
releases should use npm trusted publishing through GitHub Actions OIDC.

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
- pins the CLI and MCP server to the exact core version;
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
2. creates all three tarballs with `npm pack`;
3. installs all tarballs into a temporary project;
4. confirms package versions match;
5. runs the installed `nuzo` binary through init, remember, suggest-capture,
   recall, list, duplicate detection, and doctor;
6. verifies installed CLI operational, usage, and internal exit-code contracts;
7. connects an SDK client to the installed `nuzo-mcp-server` binary over stdio;
8. verifies the exact public tool set, calls `memory.doctor`, and exercises
   `memory.suggest_capture`, confirmed `memory.remember`, and
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

Configure a trusted publisher for each package on npmjs.com:

```text
@nuzo/memory-core
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
@nuzo/memory-core -> @nuzo/memory-cli -> @nuzo/mcp-server
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

cd ../memory-cli
npm publish --access public

cd ../mcp-server
npm publish --access public
```

Verify before distributing host plugins:

```bash
npm view @nuzo/memory-core@<version> version
npm view @nuzo/memory-cli@<version> version
npm view @nuzo/mcp-server@<version> version
NUZO_VERIFY_DIR=/tmp/nuzo-published-verify
rm -rf "$NUZO_VERIFY_DIR"
npm install --prefix "$NUZO_VERIFY_DIR" @nuzo/memory-cli@<version> @nuzo/mcp-server@<version>
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
