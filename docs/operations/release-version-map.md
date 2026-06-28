# Release Version Map

This page lists release-version references that must stay aligned when cutting
a new Nuzo release.

Release automation updates package metadata, plugin manifests, lockfile
versions, CLI/MCP runtime literals, and selected public docs. Historical
release notes and roadmap history should not be rewritten.

## Automated By `release:prepare`

`npm run release:prepare -- X.Y.Z` updates:

- `package.json`;
- `package-lock.json`;
- `packages/*/package.json`;
- Codex and Claude Code plugin manifests;
- `packages/cli/src/index.ts`;
- `packages/mcp-server/src/index.ts`;
- public release references listed in `tools/release-shared.mjs` as
  `publicReleaseReferencePaths`.

The public docs currently managed by that list are:

| File | Versioned content |
| --- | --- |
| `AGENTS.md` | current public release line. |
| `README.md` | release badge, current release status, and first-read release text. |
| `docs/index.md` | docs homepage current release panel and release state table. |
| `docs/getting-started/index.md` | current public release line. |
| `docs/getting-started/clean-install.md` | clean install package version. |
| `docs/operations/codex-plugin.md` | generated plugin `@nuzo/memory@X.Y.Z` example and validation text. |
| `docs/operations/claude-code-plugin.md` | generated plugin `@nuzo/memory@X.Y.Z` example and validation text. |
| `docs/operations/npm-publishing.md` | current npm package version list. |
| `docs/operations/versioning.md` | current package version block. |

## Checked By `release:check`

`npm run release:check -- X.Y.Z` verifies that each mapped public doc contains
the target release version. This catches the common failure where packages move
to a new release but README or docs still advertise the previous one.

If a new public page starts saying "current release", add it to
`publicReleaseReferencePaths` in `tools/release-shared.mjs`.

## Do Not Auto-Rewrite

Do not add historical files to the automatic map just because they mention old
versions. These references are intentionally historical:

- older `CHANGELOG.md` sections;
- roadmap stages that say when a capability shipped;
- post-release validation history;
- ADRs that mention the context of a past release;
- examples that intentionally show placeholder SemVer values.

If a historical page starts acting as current install guidance, split the
current guidance into a mapped page and keep the historical note separate.
