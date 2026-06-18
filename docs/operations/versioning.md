# Versioning

Nuzo uses releases as version boundaries.

Do not bump package versions for every commit. Commits describe development history; versions describe released states that users can install, compare, and depend on.

## Current Phase

Nuzo is pre-release software.

Packages currently use:

```text
0.0.0
```

Keep this until the first public MVP release is ready.

The first public release should become:

```text
0.1.0
```

## Version Scheme

After the first public release, use Semantic Versioning:

```text
MAJOR.MINOR.PATCH
```

For Nuzo before `1.0.0`:

- `0.x.y` means the public API can still change.
- bump `PATCH` for compatible fixes;
- bump `MINOR` for meaningful new functionality or contract changes;
- use pre-release identifiers for unstable release candidates, for example `0.1.0-alpha.1`.

After `1.0.0`:

- bump `PATCH` for backward-compatible bug fixes;
- bump `MINOR` for backward-compatible functionality;
- bump `MAJOR` for breaking public API or tool contract changes.

## Public API

For Nuzo, public API includes:

- CLI commands and flags;
- MCP tool names, input schemas, and output shapes;
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

## Changelog

Keep `CHANGELOG.md` human-readable.

Use an `[Unreleased]` section during development. Move entries into a version section when cutting a release.

Do not paste raw Git logs into the changelog. Summarize user-visible changes.

## Release Checklist

Before a versioned release:

1. Confirm the milestone scope is complete.
2. Run the full validation suite.
3. Update `CHANGELOG.md`.
4. Bump package versions together.
5. Commit the version bump.
6. Tag the release as `vX.Y.Z`.
7. Push the commit and tag.
8. Publish release notes from the changelog.

Use npm's version tooling only once release automation is ready. Until then, bump versions manually and review the diff carefully.

## References

- Semantic Versioning: https://semver.org/spec/v2.0.0.html
- Keep a Changelog: https://keepachangelog.com/en/1.1.0/
- Conventional Commits: https://www.conventionalcommits.org/en/v1.0.0/
- npm version command: https://docs.npmjs.com/cli/v10/commands/npm-version/

