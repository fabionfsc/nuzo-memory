# Agent Instructions

This repository is the early design and documentation home for Nuzo.

Nuzo is a local-first, auditable memory layer for Codex and MCP-compatible AI agents. The project is in early MVP development: architecture, storage, tool contracts, privacy rules, roadmap, GitHub Pages, core memory behavior, and the local CLI are already present.

## Current State

- Repository: `fabionfsc/nuzo-memory`
- Primary docs site: `https://nuzo.com.br`
- GitHub Pages fallback: `https://fabionfsc.github.io/nuzo-memory/`
- Docs engine: MkDocs Material
- Runtime code: early MVP in `packages/core`, `packages/cli`, `packages/mcp-server`, and `packages/codex-plugin`
- Current implementation: SQLite storage, FTS recall, policy checks, JSON export/import, CLI commands, and MCP memory tools
- Intended package direction: `core -> cli -> mcp-server -> codex-plugin`

## Read First

Start with:

1. `README.md`
2. `docs/README.md`
3. `docs/operations/roadmap.md`
4. `docs/architecture/overview.md`
5. `docs/architecture/boundaries.md`
6. `docs/spec/tools.md`
7. `docs/spec/memory-model.md`

## Architecture Rules

- Business logic belongs in `packages/core`.
- CLI, MCP server, and Codex plugin must call core use cases instead of duplicating behavior.
- MCP tool schemas are public contracts. Update `docs/spec/tools.md` before changing them.
- Storage starts with SQLite and SQLite FTS.
- Embeddings, sync, encryption, and UI are future optional layers.

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
node packages/cli/dist/index.js memory doctor
```

Run tests:

```bash
npm test
```

Run the local MCP server after building:

```bash
node packages/mcp-server/dist/index.js
```

## Before Pushing

Run:

```bash
npm run check
npm test
npm run build
.venv-docs/bin/mkdocs build --strict
```

Check:

- README links still work.
- `mkdocs.yml` navigation includes new docs pages.
- No runtime memory databases or exports are staged.
- No real credentials or private memory examples are added.

## Cleanup And Sanitization

Before committing or handing work back, sanitize the workspace:

- remove generated artifacts that are not meant to be committed, such as `site/` and `packages/*/dist/`;
- keep dependency caches, temporary folders, and local virtualenvs out of Git;
- run `npm ls --depth=0` after dependency changes to spot unexpected packages;
- run `npm audit --audit-level=moderate` after npm dependency changes;
- run `git status --short` and review staged files before committing;
- do not commit local memory stores, exports, credentials, or personal notes.

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
