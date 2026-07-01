# Versioning

Nuzo uses releases as version boundaries.

Do not bump package versions for every commit. Commits describe development history; versions describe released states that users can install, compare, and depend on.

## Current Phase

Nuzo is pre-`1.0` software with a public MVP release.

Packages currently use:

```text
0.9.0
```

Development commits keep the last released version until an explicit release
commit prepares the next version.

## Version Scheme

Use Semantic Versioning:

```text
MAJOR.MINOR.PATCH
```

For Nuzo before `1.0.0`:

- `0.x.y` means the public API can still change.
- bump `PATCH` for compatible fixes;
- bump `MINOR` for meaningful new functionality or contract changes;
- use pre-release identifiers for unstable release candidates, for example `0.1.0-alpha.1`.

The remaining planned release goals from `0.9.0` through `1.0.0` are documented in
`docs/operations/release-goals.md`. The full three-part SemVer version is used
in public release names as well as package metadata, plugin manifests, and Git
tags. The stable release is named Nuzo `1.0.0`, not a separate public `1.0`
alias.

Patch numbers are not planning stages. For example, `0.3.5` would mean the
fifth compatible patch in the `0.3` line; it must not be used as an umbrella
for unrelated new recall, audit, capture, and semantic capabilities.

After `1.0.0`:

- bump `PATCH` for backward-compatible bug fixes;
- bump `MINOR` for backward-compatible functionality;
- bump `MAJOR` for breaking public API or tool contract changes.

## Public API

For Nuzo, public API includes:

- CLI commands and flags;
- MCP tool names, input schemas, and output shapes;
- `@nuzo/memory-core` root exports and documented type/value contracts;
- memory export format;
- package names and binary names;
- documented runtime storage locations;
- host plugin manifest contracts once released.

Internal docs, tests, and implementation refactors do not require version bumps unless they change a released public contract.

## Commit Style

Use Conventional Commit-style messages when practical:

```text
feat(cli): add memory import dry-run
fix(core): reject malformed export items
docs(operations): document versioning policy
test(mcp): cover doctor warnings
chore(repo): update issue templates
```

Recommended types:

- `feat`
- `fix`
- `docs`
- `test`
- `refactor`
- `build`
- `ci`
- `chore`

Breaking changes must be explicit:

```text
feat(mcp)!: rename memory.remember input field

BREAKING CHANGE: memory.remember now expects text instead of content.
```

Conventional Commits are recommended but are not enforced in CI yet. Revisit
CI enforcement if commit history starts to drift; do not add a commit-lint
dependency without evidence that it improves the workflow.

## Changelog

Keep `CHANGELOG.md` human-readable.

Use an `[Unreleased]` section during development. Move entries into a version section when cutting a release.

Do not paste raw Git logs into the changelog. Summarize user-visible changes.

Release PRs must update `CHANGELOG.md`. The target release section must use:

```text
## [X.Y.Z] - YYYY-MM-DD
```

Keep a fresh empty `[Unreleased]` section above the released section after the
release commit.

## Release Automation

Use manual release commits with repository scripts. Do not use `npm version`
for now, because Nuzo has multiple workspace packages, host plugin manifests,
runtime package dependencies, and source-level version strings that must move
together.

Check version consistency at any time:

```bash
npm run release:check
```

The check also verifies that every `packages/*/package.json` and host plugin
`plugin.json` manifest is covered by release tooling. If a new workspace package
or host plugin is added, update the release scripts in the same change.

Prepare a release version after the changelog section exists:

```bash
npm run release:prepare -- 0.1.0
npm run release:check -- 0.1.0
```

Before changing the source worktree, rehearse the target release in an isolated
temporary copy:

```bash
npm run release:rehearse -- 0.1.0
```

The rehearsal creates a synthetic dated changelog section only in the
temporary copy, installs from the lockfile, prepares/checks the target version,
and validates plugin plus npm artifacts. It always removes the temporary copy
and leaves source packages at the current released version.

The target must not already have a changelog release section. Local
credentials, memory stores, exports, environment files, dependency caches, and
operator notes are excluded from the rehearsal copy.

The prepare script updates:

- root and workspace package versions;
- Nuzo workspace dependency pins;
- `package-lock.json` workspace versions;
- CLI and MCP server runtime version strings;
- Codex and Claude Code plugin manifest versions.

It refuses `0.0.0`, because that version is reserved for unreleased
development.

Tag releases as:

```text
vX.Y.Z
```

GitHub release notes should be written from the matching `CHANGELOG.md`
section, not generated from raw commit logs.

## Release Checklist

Before a versioned release, follow `docs/operations/release-checklist.md`.

Use `npm version` only if a future release automation change documents how it
updates every Nuzo package, lockfile entry, host plugin manifest, and source
version string consistently.

## References

- Semantic Versioning: https://semver.org/spec/v2.0.0.html
- Keep a Changelog: https://keepachangelog.com/en/1.1.0/
- Conventional Commits: https://www.conventionalcommits.org/en/v1.0.0/
- npm version command: https://docs.npmjs.com/cli/v10/commands/npm-version/
