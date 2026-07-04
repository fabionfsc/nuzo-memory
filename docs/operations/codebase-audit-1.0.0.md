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
| `tools/` directory | Keep committed. | Release, smoke, benchmark, docs, packaging, and governance validation depend on it. npm staging excludes it. | Shared benchmark helpers landed through #237; keep new harness logic focused. |
| Generated artifacts | Keep untracked. | `.gitignore` excludes `dist/`, `build/`, `site/`, memory stores, exports, npm caches, virtualenvs, and local agent notes. `git status --short` is clean after validation cleanup. | Continue checking before release and PR handoff. |
| Setup/update path | Keep explicit first-time setup and managed updates. | `nuzo setup`, managed-host receipt, package postinstall, and `nuzo update --yes` recovery path. Postinstall refresh is gated by an existing managed-host receipt and filters npm/project-local PATH shadowing. | Interactive host selection landed through #245; postinstall hardening landed through #273. |
| CLI manager | Keep as CLI-only control plane. | `nuzo memory manage` reuses core use cases and existing local store. | Evaluation and documentation completed through #216. |

## Safe Fixes Applied

- Updated maintainer-facing Codex and Claude Code package READMEs from stale
  `@nuzo/memory@0.8.1` runtime examples to the current `0.9.1` package.
- Updated ADR 0006 so the older rejection of a global install is clear: a
  global install is rejected only as the sole runtime assumption for standalone
  plugin artifacts, while the current user path is npm-first.
- Updated the historical roadmap note that previously said
  `@nuzo/memory-cli` should be the default package users see first.
- Hardened project initialization, managed-file writes, exports, private config,
  and SQLite store opening against symlink redirection.
- Hardened npm postinstall host refresh so first install never mutates host
  configuration and managed updates do not execute project-local shadow host
  binaries.
- Replaced unbounded lifecycle-hook stdin buffering with bounded incremental
  UTF-8 decoding while preserving fail-open hook behavior.
- Removed completed `0.9.0` transition wording from current operations docs and
  kept historical pages period-accurate.

## Completed Focused Refactors

The audit split larger hygiene work into focused issues. All of the following
are complete:

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
- [#253](https://github.com/fabionfsc/nuzo-memory/issues/253): Split runtime
  configuration parsing from resolution.
- [#257](https://github.com/fabionfsc/nuzo-memory/issues/257): Harden
  project-local file writes and SQLite store paths against symlink redirection.
- [#258](https://github.com/fabionfsc/nuzo-memory/issues/258): Fail capture
  suggestion relationship classification safe when candidate evidence is
  non-exhaustive.
- [#262](https://github.com/fabionfsc/nuzo-memory/issues/262),
  [#264](https://github.com/fabionfsc/nuzo-memory/issues/264), and
  [#265](https://github.com/fabionfsc/nuzo-memory/issues/265): Tighten
  integer, audit-filter, and direct-update boundary validation.
- [#266](https://github.com/fabionfsc/nuzo-memory/issues/266): Detect
  fine-grained `github_pat_` GitHub tokens in the local secret scanner.
- [#268](https://github.com/fabionfsc/nuzo-memory/issues/268): Remove completed
  `0.9.0` transition language from current operations docs.
- [#269](https://github.com/fabionfsc/nuzo-memory/issues/269): Enforce the
  lifecycle-hook stdin bound while reading.
- [#273](https://github.com/fabionfsc/nuzo-memory/issues/273): Harden npm
  postinstall host refresh against PATH shadowing.

## Remaining Non-Blocking Follow-Ups

The audit found two p2 architecture follow-ups that are useful, but not a
reason to publish extra legacy packages or block release preparation:

- [#260](https://github.com/fabionfsc/nuzo-memory/issues/260): Bound
  capture-suggestion candidate retrieval with an indexed or otherwise
  correctness-preserving storage prefilter. Do not replace this with a simple
  list limit, because exact duplicate and update/related correctness depend on
  complete same-scope evidence or an explicit non-exhaustive result.
- [#272](https://github.com/fabionfsc/nuzo-memory/issues/272): Evaluate npm and
  verified one-line installer entry points. The current supported path remains
  `npm install --global @nuzo/memory` followed by explicit `nuzo setup`.

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

The focused modularization, hardening, and developer-experience follow-ups that
were identified as release-readiness work are complete. The codebase is ready
to enter the `1.0.0` release process with the current package layout after the
normal final release validation. Do not remove the CLI or MCP source
workspaces; they remain internal build inputs for the unified package.

The final pre-release evidence and remaining publication-only steps are
recorded in [1.0.0 Release Readiness Audit](release-readiness-1.0.0.md).
