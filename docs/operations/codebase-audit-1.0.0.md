# 1.0.0 Codebase Audit

This audit records the pre-`1.0.0` repository review for structure, legacy
paths, package boundaries, generated files, and maintainability.

It is intentionally scoped to codebase hygiene. It does not publish a release
and does not redefine the product contract in
[1.0.0 Developer Experience Contract](developer-experience-1.0.0.md).

## Current Decision Summary

| Area | Decision | Evidence | Follow-up |
| --- | --- | --- | --- |
| Unified npm package | Keep `@nuzo/memory` as the recommended install and management package. | Public docs, package README, and npm validators now use the npm-first path. | Continue enforcing with docs/package checks. |
| Legacy transition packages | Keep `packages/cli` and `packages/mcp-server` as source workspaces; do not publish new public versions after `0.9.0`. | `tools/npm-package-policy.mjs`, npm publishing docs, release checklist. | Remove only after internal build/package architecture no longer needs source workspaces. |
| Root hidden plugin catalogs | Keep `.agents/plugins/marketplace.json` and `.claude-plugin/marketplace.json`. | They are host discovery contracts for Codex and Claude Code marketplace development. | Revisit only if host CLIs support a unified catalog location. |
| Host plugin hidden manifests | Keep `.codex-plugin/` and `.claude-plugin/` inside package roots. | Host-required plugin manifest paths. | Do not collapse into a custom `.plugins/` directory. |
| `tools/` directory | Keep committed. | Release, smoke, benchmark, docs, packaging, and governance validation depend on it. npm staging excludes it. | Refactor repeated harness code in #237. |
| Generated artifacts | Keep untracked. | `.gitignore` excludes `dist/`, `build/`, `site/`, memory stores, exports, npm caches, virtualenvs, and local agent notes. `git ls-files` found no tracked generated runtime artifacts. | Continue checking before release and PR handoff. |
| Setup/update path | Keep explicit first-time setup and managed updates. | `nuzo setup`, managed-host receipt, package postinstall, and `nuzo update --yes` recovery path. | Add interactive host selection in #245. |
| CLI manager | Keep as CLI-only control plane. | `nuzo memory manage` reuses core use cases and existing local store. | Close #216 after the implementing PR lands. |

## Safe Fixes Applied

- Updated maintainer-facing Codex and Claude Code package READMEs from stale
  `@nuzo/memory@0.8.1` runtime examples to the current `0.9.1` package.
- Updated ADR 0006 so the older rejection of a global install is clear: a
  global install is rejected only as the sole runtime assumption for standalone
  plugin artifacts, while the current user path is npm-first.
- Updated the historical roadmap note that previously said
  `@nuzo/memory-cli` should be the default package users see first.

## Larger Refactors Already Split Out

These are valid codebase hygiene items, but they are intentionally tracked as
focused work instead of being hidden inside one broad cleanup:

- [#234](https://github.com/fabionfsc/nuzo-memory/issues/234): Refactor CLI
  entrypoint into focused command modules.
- [#235](https://github.com/fabionfsc/nuzo-memory/issues/235): Split core
  memory service internals by responsibility.
- [#236](https://github.com/fabionfsc/nuzo-memory/issues/236): Reduce MCP
  handler and protocol-test review surface.
- [#237](https://github.com/fabionfsc/nuzo-memory/issues/237): Consolidate
  repeated benchmark and smoke-test harness code.
- [#245](https://github.com/fabionfsc/nuzo-memory/issues/245): Add interactive
  host selection to `nuzo setup`.

## Package Boundary Notes

The intended package direction remains:

```text
core -> cli/mcp-server -> memory package -> host plugins
```

The source workspaces `packages/cli` and `packages/mcp-server` still matter
because the unified `@nuzo/memory` package stages their built outputs into one
publishable package. That does not mean the legacy npm packages should receive
new public releases.

Business logic must stay in `packages/core`. CLI, MCP, and host plugin code
should remain adapters over core use cases. The audit found no reason to move
memory lifecycle behavior into host plugin packages.

## Public Documentation Notes

The public path should stay:

```bash
npm install --global @nuzo/memory
nuzo setup
nuzo memory manage
```

Direct Codex and Claude Code plugin commands are still documented as advanced
manual host paths, not as the primary onboarding path. Package validators and
docs snippet checks should continue preventing regressions to plugin-first
first-use documentation.

## Generated And Local Files

The audit checked for tracked generated/runtime artifacts and found no tracked:

- `dist/`
- `build/`
- `site/`
- `node_modules/`
- `.nuzo/`
- SQLite memory stores
- memory exports
- npm credentials
- local env files
- local agent notes

Local dependency folders such as `node_modules/` and `.venv-docs/` may exist on
developer machines, but they remain ignored and should not be committed.

## 1.0.0 Readiness Recommendation

The codebase is ready to continue toward `1.0.0` with the current layout. Do
not remove the CLI or MCP source workspaces yet; they are internal build inputs
for the unified package. The highest-value next cleanup is modularization, not
deletion:

1. land the developer experience gate PR;
2. complete #245 for a cleaner default `nuzo setup`;
3. work through #234-#237 in small PRs;
4. rerun this audit before cutting a `1.0.0` release candidate.
