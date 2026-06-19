# Changelog

All notable changes to Nuzo will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning after the first public release.

## [Unreleased]

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
- MCP `memory.doctor` now reports read-only store health, aggregate counts, tool names, and warnings.
- CLI and MCP audit history access for individual memory IDs.
- Dry-run-first bulk forget by scope, tags, or explicit all selection through CLI and MCP.
- Idempotent user/project initialization with config files, deterministic project scopes, auxiliary directories, and Git ignore protection.
- Codex plugin skill guidance for read-only recall and confirmed capture suggestions.
- Protocol-level MCP contract tests using the official SDK client and in-memory transport.
- Expanded local secret detection for common provider keys, AWS keys, JWTs, bearer tokens, credential URLs, and session values.
- Stable CLI process exit codes for success, operational errors, usage errors, and unexpected failures.

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
