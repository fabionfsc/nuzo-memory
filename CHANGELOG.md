# Changelog

All notable changes to Nuzo will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning after the first public release.

## [Unreleased]

### Added

- Bounded core and MCP inputs for memory content, tags, sources, recall queries,
  destructive-action reasons, and import size.
- SQLite busy timeout and Unicode-aware recall tokenization.
- Secret scanning for npm access tokens.
- Installed npm artifact validation now performs an MCP stdio handshake, checks
  the exact tool set, and calls `memory.doctor`.
- Release rehearsal now excludes local credentials and memory artifacts,
  requires an explicit unreleased target in CI, and rejects existing releases.
- Manual release input is passed through a quoted environment variable, and
  release tooling now enforces strict SemVer identifiers.
- Release contract tests now cover invalid versions, workflow input handling,
  and local npm credential ignores.
- Documented sequential execution for gates that share generated `dist`
  directories.
- npm staging now rejects local dependency references.
- Dependabot update configuration for npm, GitHub Actions, and Python docs
  dependencies.
- CodeQL analysis workflow for JavaScript and TypeScript security checks.
- Optimistic memory revisions with structured conflict handling for stale
  update, archive, and delete operations.
- Optional restricted scope authorization in core policy and MCP runtime
  configuration.
- Manual npm trusted-publishing workflow for future releases.
- MCP `memory.suggest_capture` for read-only capture draft validation,
  normalization, and exact active duplicate detection before confirmed writes.

### Documentation

- Added a lightweight specification-driven workflow and architecture proposal
  template for substantial or cross-boundary changes.
- Updated post-MVP status claims to distinguish completed authorization,
  concurrency, configuration, and security work from remaining distribution
  and lifecycle work.
- Documented pull-request-only changes, administrator branch protection, and
  the emergency recovery policy.
- Documented the capture suggestion tool contract and updated host guidance to
  validate inferred drafts before calling `memory.remember`.
- Documented local file permissions, project-config path containment, input
  limits, and the current scope-isolation boundary.
- Documented the test organization decision for package-local tests, shared
  runtime contracts, and future `test-support/` extraction.
- Corrected the published MCP package invocation and recorded post-MVP
  authorization, concurrency, config, and repository-security work.
- Marked the public `0.1.0` MVP, npm packages, and clean Codex/Claude Code host
  validation as released.
- Moved trusted npm publishing and public marketplace distribution into
  post-MVP work.
- Documented repository security automation expectations in the release
  checklist, issue-hunting workflow, and security policy.
- Documented that memory selectors are not authorization and described
  restricted scope behavior for MCP and host sessions.
- Documented npm trusted publisher setup, release dry-run, provenance, and
  recovery checks.

### Changed

- Recall usage recording is now opt-in so normal recall does not persist query
  text or update `last_used_at`.
- Updated `better-sqlite3` and Vitest within their compatible release lines.
- Updated MkDocs Material to the current compatible release.

### Fixed

- User and project config now control runtime store, scope, recall defaults,
  and opt-in recall audit behavior with documented precedence.
- User config accepts absolute and `~/` storage paths, while project config
  remains confined to `.nuzo/memory`.
- Nuzo-created runtime files and directories now use owner-only permissions.
- Project config can no longer redirect storage outside `.nuzo/memory`.
- CLI numeric arguments no longer accept trailing non-numeric text.
- Missing or oversized import files now return structured operational errors.
- Accented terms such as Portuguese words remain intact during recall.

## [0.1.0] - 2026-06-19

### Added

- Local-first memory core backed by SQLite and FTS.
- Local CLI commands for init, remember, recall, list, update, forget, export, import, and doctor.
- MCP server exposing the Nuzo memory tool contract.
- Codex and Claude Code plugin wrapper scaffolds.
- MkDocs documentation site and GitHub Pages publishing.
- GitHub Issues workflow, labels, milestones, and issue templates.
- Codex plugin validation now checks the bundled MCP config shape.
- Claude Code plugin validation now checks display metadata and the bundled MCP config shape.
- Capture suggestion specification for inferred memories without silent writes.
- MCP `memory.recall_hook` prototype for read-only task-start recall.
- GitHub Actions CI for package checks, tests, builds, CLI smoke testing, and strict docs validation.
- Runtime support policy for Node.js 22/24 LTS, npm 10+, and native SQLite build troubleshooting.
- Host plugin artifact generator with release-path validation for Codex and Claude Code.
- Reproducible npm package staging and clean-install validation for core and MCP runtime artifacts.
- Reproducible npm package staging and installed-binary validation for the Nuzo CLI.
- Release-state tooling for coordinated version preparation and changelog validation.
- Release-state validation now detects drift when workspace packages or plugin manifests are not covered by release tooling.
- Manual GitHub Actions release rehearsal for target-version validation before tagging.
- MCP `memory.doctor` now reports read-only store health, aggregate counts, tool names, and warnings.
- CLI and MCP audit history access for individual memory IDs.
- Dry-run-first bulk forget by scope, tags, or explicit all selection through CLI and MCP.
- Idempotent user/project initialization with config files, deterministic project scopes, auxiliary directories, and Git ignore protection.
- Codex plugin skill guidance for read-only recall and confirmed capture suggestions.
- Protocol-level MCP contract tests using the official SDK client and in-memory transport.
- Expanded local secret detection for common provider keys, AWS keys, JWTs, bearer tokens, credential URLs, and session values.
- Stable CLI process exit codes for success, operational errors, usage errors, and unexpected failures.
- MCP doctor schema-version and non-destructive store writability diagnostics.
- Isolated target-version release rehearsal with host plugin manifest version checks.

### Documentation

- Public MVP status and roadmap wording now reflect implemented core, CLI, MCP, plugin packaging, and release rehearsal work.
- MCP export and doctor examples now match the current tool contract.

### Changed

- Public docs now treat Nuzo as host-neutral across Codex, Claude Code, and MCP-compatible agents.
- Codex plugin docs now separate official plugin packaging, development marketplace testing, and direct MCP debugging.
- Claude Code plugin docs now separate official plugin packaging, development `--plugin-dir` testing, marketplace direction, and direct MCP debugging.
- Lifecycle hook docs now route inferred writes through confirmed capture drafts before `memory.remember`.
- MCP tool docs now distinguish normal recall from the read-only recall hook entrypoint.
- Package engine declarations and CI now agree on the supported Node.js baseline.
- Release plugins now pin the shared MCP server package instead of relying on monorepo sibling paths.
- Package builds now remove stale output and exclude tests from publish candidates.
- CLI smoke testing now skips Git tracking checks explicitly through `NUZO_DOCTOR_SKIP_GIT=1`.

### Fixed

- The installed MCP binary now starts correctly when invoked through the npm-generated `node_modules/.bin` symlink.
- The installed CLI now runs correctly through the npm-generated `node_modules/.bin/nuzo` symlink.
- `nuzo memory doctor` can now report a clean status in restricted environments when only the Git tracking check is intentionally skipped.

- CLI `memory forget` now accepts the documented `--archive` flag and rejects conflicting `--archive --delete` usage.
- Import now rejects malformed export memory items with structured `MEMORY_EXPORT_INVALID` errors instead of leaking runtime type errors.
- Import now preflights every item before writing and reports within-document duplicates consistently in dry-run and real modes.
- SQLite migration failures for newer schemas now use a structured error, with coverage for schema creation and idempotency.
- All audited core operations now reject empty actor identities consistently.
- SQLite mutations now roll back memory, FTS, and audit writes atomically, including complete multi-item imports.
- List, export, and bulk-forget filters now reject invalid scopes and tags consistently.
- MCP tool schemas now reject invalid scopes and tags using the same rules as the core policy engine.
