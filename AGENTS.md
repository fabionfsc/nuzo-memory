# Agent Instructions

This repository is the early design and documentation home for Nuzo.

Nuzo is a local-first, auditable memory layer for Codex, Claude Code, and MCP-compatible AI agents. The project is in early MVP development: architecture, storage, tool contracts, privacy rules, roadmap, GitHub Pages, core memory behavior, and the local CLI are already present.

## Current State

- Repository: `fabionfsc/nuzo-memory`
- Primary docs site: `https://nuzo.com.br`
- GitHub Pages fallback: `https://fabionfsc.github.io/nuzo-memory/`
- Docs engine: MkDocs Material
- Runtime code: early MVP in `packages/core`, `packages/cli`, `packages/mcp-server`, `packages/codex-plugin`, and `packages/claude-code-plugin`
- Current implementation: SQLite storage, FTS recall, policy checks, JSON export/import, CLI commands, and MCP memory tools
- Intended package direction: `core -> cli -> mcp-server -> host plugins`

## Read First

Start with:

1. `README.md`
2. `docs/README.md`
3. `docs/operations/roadmap.md`
4. `docs/architecture/overview.md`
5. `docs/architecture/boundaries.md`
6. `docs/architecture/agent-host-compatibility.md`
7. `docs/spec/tools.md`
8. `docs/spec/memory-model.md`
9. `docs/spec/capture-suggestions.md`
10. `docs/operations/local-cli.md`
11. `docs/operations/codex-plugin.md`
12. `docs/operations/claude-code-plugin.md`
13. `docs/operations/lifecycle-hooks.md`
14. `docs/operations/issue-tracking.md`
15. `docs/operations/versioning.md`
16. `docs/operations/runtime-support.md`
17. `docs/operations/release-checklist.md`

## Local Operator Notes

If `AGENTS.local.md` exists at the repository root, read it after this file.

`AGENTS.local.md` is for machine-local operator preferences, temporary environment notes, and non-public workflow guidance. It must stay untracked and must not be committed.

## Architecture Rules

- Business logic belongs in `packages/core`.
- CLI, MCP server, and host plugins must call core use cases instead of duplicating behavior.
- MCP tool schemas are public contracts. Update `docs/spec/tools.md` before changing them.
- Storage starts with SQLite and SQLite FTS.
- Embeddings, sync, encryption, and UI are future optional layers.

## Host Plugin Direction

- Nuzo is host-neutral. Codex and Claude Code are priority hosts, but MCP/core remain the product center.
- Prefer official host plugin paths before adding local installer scripts or development-only workarounds.
- Do not add plugin install/update helpers until the supported host plugin workflow and local plugin directory contract are stable and documented.
- Host plugins should remain thin wrappers around the MCP server and should not contain memory business logic.
- Automatic recall or capture hooks must follow `docs/operations/lifecycle-hooks.md` and require confirmation before inferred writes.
- Capture suggestions must follow `docs/spec/capture-suggestions.md`; inferred memories are drafts until the user confirms them.
- If plugin setup docs are needed, document the official workflow first; local testing notes should be clearly marked as development-only.

## Privacy And Safety Rules

- Do not commit runtime memory files.
- Default runtime memory location is `~/.nuzo/memory/`.
- Optional project memory location is `<project>/.nuzo/memory/`.
- Do not introduce telemetry or network calls by default.
- Do not store secrets, tokens, credentials, cookies, private keys, or real user memory in examples.
- Example memory exports must use fake data only.

## Git Ignore Expectations

Keep these ignored:

```gitignore
.nuzo/memory/
.nuzo/**/*.sqlite
.nuzo/**/*.sqlite-*
*.memory.export.md
*.memory.export.json
site/
.venv/
.venv-*/
```

## Docs Commands

Create docs environment:

```bash
python3 -m venv .venv-docs
.venv-docs/bin/pip install -r requirements-docs.txt
```

Build docs:

```bash
.venv-docs/bin/mkdocs build --strict
```

Serve docs locally:

```bash
.venv-docs/bin/mkdocs serve
```

## TypeScript Commands

Use Node.js 22 LTS or 24 LTS with npm 10 or newer. Keep the root and workspace
`engines` fields, CI matrix, and `docs/operations/runtime-support.md` aligned.

Install workspace dependencies:

```bash
npm install
```

Type-check:

```bash
npm run check
```

Build packages:

```bash
npm run build
```

Run the local CLI after building:

```bash
npm run nuzo -- memory doctor
```

Run tests:

```bash
npm test
```

Run the local MCP server after building:

```bash
node packages/mcp-server/dist/index.js
```

Validate the Codex plugin manifest:

```bash
npm run check -w @nuzo/codex-plugin
```

Validate the Claude Code plugin manifest:

```bash
npm run check -w @nuzo/claude-code-plugin
```

Validate with host-native CLIs when available:

```bash
claude plugin validate packages/claude-code-plugin
```

If a required validation tool is missing, install it through the official upstream installation path when feasible, then document any persistent local setup detail in `AGENTS.local.md` rather than in public project docs.

## Before Pushing

Run:

```bash
npm run check
npm test
npm run build
npm run smoke:cli
.venv-docs/bin/mkdocs build --strict
```

Check:

- README links still work.
- `mkdocs.yml` navigation includes new docs pages.
- No runtime memory databases or exports are staged.
- No real credentials or private memory examples are added.
- Release-oriented changes follow `docs/operations/release-checklist.md`.

GitHub runs the same core validation gates from:

```text
.github/workflows/ci.yml
```

Keep CI validation separate from GitHub Pages deployment.

## Cleanup And Sanitization

Before committing or handing work back, sanitize the workspace:

- remove generated artifacts that are not meant to be committed, such as `site/` and `packages/*/dist/`;
- keep dependency caches, temporary folders, and local virtualenvs out of Git;
- run `npm ls --depth=0` after dependency changes to spot unexpected packages;
- run `npm audit --audit-level=moderate` after npm dependency changes;
- run `git status --short` and review staged files before committing;
- do not commit local memory stores, exports, credentials, or personal notes.

## Issue Tracking

- Use GitHub Issues for executable work, not broad notes.
- Prefer labels from `docs/operations/issue-tracking.md`.
- Keep roadmap/docs as direction and issues as assignable tasks.
- Do not put secrets, real memory exports, or private user data in issues.
- Do periodic issue hunting after meaningful changes: scan docs, code, tests, workflows, and public GitHub state for drift, bugs, missing validation, and stale roadmap claims.
- When issue hunting finds a small safe fix, implement it directly and mention it in the related issue or final summary; when it finds larger or uncertain work, create a focused GitHub Issue with labels, milestone, and acceptance criteria.

## Versioning

- Follow `docs/operations/versioning.md`.
- Do not bump package versions for every commit.
- Keep packages at `0.0.0` until the first public MVP release is ready.
- Use `CHANGELOG.md` for notable user-facing changes under `[Unreleased]`.
- Version bumps should be release commits with tags, not ordinary development commits.

## GitHub Pages

Pages is deployed by:

```text
.github/workflows/pages.yml
```

Custom domain:

```text
docs/CNAME
```

If DNS or HTTPS is being checked, see:

```text
docs/operations/github-pages.md
```

## Notes For Future Agents

- Prefer editing docs in `docs/` rather than duplicating long content in root files.
- Root files should be fast entry points: `README.md` for humans, `AGENTS.md` for agents.
- If adding implementation code, create package boundaries before adding cross-package imports.
- If adding a public command or MCP tool, update docs and tests in the same change.
