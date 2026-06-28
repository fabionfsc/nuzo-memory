# Agent Instructions

This repository is the design, implementation, and documentation home for
Nuzo.

Nuzo is a local-first, auditable memory layer for Codex, Claude Code, and
MCP-compatible AI agents. Version `0.4.0` is the current public release.

## Start Here

Read these first:

1. `README.md`
2. `CONTRIBUTING.md`
3. `docs/getting-started/index.md`
4. `docs/operations/roadmap.md`
5. `docs/architecture/overview.md`
6. `docs/architecture/boundaries.md`
7. `docs/spec/tools.md`
8. `docs/spec/memory-model.md`
9. `docs/spec/capture-suggestions.md`

Use docs in `docs/` as the source of detail. Keep root files short entry
points.

## Local Notes

If `AGENTS.local.md` exists at the repository root, read it after this file.

`AGENTS.local.md` is for machine-local operator preferences, temporary
environment notes, and non-public workflow guidance. It is ignored by Git and
must not be committed.

Do not put secrets, real memory exports, credentials, tokens, private user
data, or personal operator notes in public docs, issues, examples, or tests.

## Architecture Rules

- Business logic belongs in `packages/core`.
- CLI, MCP server, and host plugins must call core use cases instead of
  duplicating behavior.
- MCP tool schemas are public contracts. Update `docs/spec/tools.md` before or
  alongside tool contract changes.
- Host plugins should remain thin wrappers around the MCP server.
- Storage starts with SQLite and SQLite FTS.
- Embeddings, sync, encryption, and UI are future optional layers.
- Do not introduce telemetry, network calls, remote embeddings, or silent
  inferred writes by default.
- Inferred memories are drafts until the user confirms them.

## Package Direction

The intended package direction is:

```text
core -> cli/mcp-server -> memory package -> host plugins
```

Most users install `@nuzo/memory`. MCP hosts and generated host plugin
artifacts resolve `@nuzo/memory`. Library-level integrations use
`@nuzo/memory-core`.

Source workspace packages remain private. Publish only generated npm staging
packages after following `docs/operations/npm-publishing.md`.

## Git And Issues

- Do not push routine changes directly to `main`.
- Create a focused branch, commit validated changes, push the branch, and open
  a pull request.
- Wait for required Node 22, Node 24, documentation, and CodeQL checks before
  merging.
- Prefer squash merge with an intentional Conventional Commit subject.
- Use GitHub Issues for executable work, not broad notes.
- Keep roadmap/docs as direction and issues as assignable tasks.
- Do periodic issue hunting after meaningful changes.

## Validation

For docs-only changes, run:

```bash
.venv-docs/bin/mkdocs build --strict
git diff --check
```

For code, package, release, or cross-boundary changes, run the relevant subset
from:

```bash
npm run check
npm run release:check
npm test
npm run build
npm run package:plugins
npm run validate:npm
npm run smoke:cli
npm run smoke:claude-code-plugin
npm run smoke:codex-plugin
.venv-docs/bin/mkdocs build --strict
```

Run build-mutating gates sequentially. Several commands share or recreate
`packages/*/dist/`; parallel execution can invalidate subprocess fixtures.

## Cleanup

Before committing or handing work back:

- remove generated artifacts that are not meant to be committed, such as
  `site/`, `build/`, `dist/`, and `packages/*/dist/`;
- keep dependency caches, temporary folders, virtualenvs, local npm config, and
  local memory stores out of Git;
- review `git status --short`;
- confirm no runtime memory databases, exports, credentials, or personal notes
  are staged.

Keep these ignored:

```gitignore
.nuzo/memory/
.nuzo/**/*.sqlite
.nuzo/**/*.sqlite-*
*.memory.export.md
*.memory.export.json
site/
build/
dist/
.venv/
.venv-*/
AGENTS.local.md
```

## Project References

- Runtime support: `docs/operations/runtime-support.md`
- Local CLI: `docs/operations/local-cli.md`
- Codex plugin: `docs/operations/codex-plugin.md`
- Claude Code plugin: `docs/operations/claude-code-plugin.md`
- Lifecycle hooks: `docs/operations/lifecycle-hooks.md`
- Versioning: `docs/operations/versioning.md`
- Release checklist: `docs/operations/release-checklist.md`
- Issue tracking: `docs/operations/issue-tracking.md`
- Specification workflow: `docs/operations/spec-driven-workflow.md`
