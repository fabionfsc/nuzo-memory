# Changelog

All notable changes to Nuzo will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning after the first public release.

## [Unreleased]

### Added

- Deterministic Capture Intelligence benchmark with a reproducible `v0.5.0`
  baseline, English-primary relationship fixtures, and zero-write, policy,
  scope, archived, latency, and evidence-bound safety gates.

## [0.5.0] - 2026-06-28

### Added

- Deterministic local recall benchmark covering synthetic English,
  Portuguese, Unicode, topical tag, scope, bounded-result, noise, and
  realistic agent-prompt fixtures.

### Changed

- SQLite recall now ignores common prompt stop words and filters weak
  single-term noise from multi-term queries while preserving exact short-tag
  recall.

### Fixed

- Scoped FTS ranking now rejects unrelated single-term candidates while
  preserving unique strong terms, exact topical tags, inspectable reasons,
  and bounded result limits.

## [0.4.0] - 2026-06-28

### Added

- Store-wide audit query contracts are now exposed through core, CLI, and MCP
  with bounded filters for event type, actor, memory ID, scope, time, and
  result limit.

### Changed

- npm publishing docs now define `@nuzo/memory-cli` and `@nuzo/mcp-server` as
  legacy transition packages pending an explicit pre-`1.0.0` lifecycle
  decision.

### Fixed

- Published plugin artifact smokes now load built trust-test helpers after
  packaging, so a clean checkout does not require pre-existing `dist` output.

## [0.3.1] - 2026-06-28

### Added

- Memory-poisoning threat model and hostile-content regression coverage for
  direct lifecycle hooks and generated Codex and Claude Code artifacts.

### Changed

- Lifecycle hooks now render bounded, source-attributed JSON records inside an
  explicit untrusted-data envelope instead of interpolating memory into plain
  text bullets.

### Fixed

- Privacy and host documentation now distinguishes scope selection, restricted
  core-policy authorization, administrator CLI access, and separate-store
  isolation.

## [0.3.0] - 2026-06-27

### Added

- `@nuzo/memory` npm package for the CLI, MCP server, and host lifecycle hook
  runner.
- Package README for the new recommended user install path.

### Changed

- Codex and Claude Code release artifacts now resolve `@nuzo/memory` instead
  of the legacy MCP-only package.
- User-facing install docs now point to one package: `@nuzo/memory`.
- `@nuzo/memory-cli` and `@nuzo/mcp-server` package READMEs now point to
  `@nuzo/memory`.
- npm release validation now checks the unified package binaries for CLI, MCP,
  and host hook workflows.

## [0.2.1] - 2026-06-27

### Added

- Plugin-bundled `SessionStart` and `UserPromptSubmit` recall hooks for Codex
  and Claude Code.
- A shared `nuzo-memory-hook` executable in `@nuzo/mcp-server` that emits
  bounded host `additionalContext` without capture or memory writes.
- Explicit `autoload` tag semantics for bounded session bootstrap, alongside
  topical tag recall for submitted prompts.
- Host hook diagnostics for runtime, store, supported events, and the remaining
  host-level trust check.
- Cross-session host hook smoke coverage across 75 synthetic memories, 53
  scenarios, common memory categories, project isolation, and 15 languages,
  plus installed npm binary validation.

### Changed

- Codex and Claude Code plugin skills now treat lifecycle recall as the primary
  path and MCP tool invocation as the fallback.
- Host plugin artifacts package the same version-pinned read-only hook runner.
- `memory.doctor` now reports lifecycle capability without claiming that a host
  has enabled or trusted its plugin hooks.
- Capture guidance now suggests a small set of user-confirmed topical tags.
- Exact topical tag matches receive deterministic priority over incidental
  common-word matches in SQLite and in-memory recall.

### Fixed

- `project:auto` now resolves to a stable path-derived project scope in the CLI
  and MCP server instead of becoming one shared literal namespace.
- CLI doctor now reports legacy literal `project:auto` records, and
  `memory list --all-scopes` exposes them for explicit scope review.
- Contextual prompt hooks no longer repeat `autoload` memories already injected
  by the session-start hook.

## [0.2.0] - 2026-06-24

### Documentation

- Expanded the roadmap for the `0.2.0` agent memory lifecycle milestone and
  proposed follow-up `0.2.x` releases for capture refinement, Claude Code/MCP
  parity, audit UX, and local quality benchmarks.
- Documented the Codex-first `0.2.0` agent memory loop in the plugin skill,
  Codex operation docs, and issue-tracking milestone guidance.
- Documented and tightened the Codex plugin smoke coverage for read-only
  task-start recall across MCP sessions.
- Documented the Codex explicit save request flow for commands such as
  "save this in Nuzo memory".
- Documented smoke coverage for rejected inferred capture drafts in the
  Codex/MCP session-continuity flow.
- Documented duplicate, update, and separate-memory decision rules for capture
  suggestions.
- Documented structured MCP `memory.update` revision conflict errors.
- Added an agent memory loop walkthrough covering confirmed writes, later
  recall, review commands, safe dogfooding examples, and validation smokes.

### Changed

- Strengthened MCP session-continuity smoke validation so task-start
  `memory.recall_hook` must remain read-only, avoid capture suggestions, and
  avoid adding recall audit events.
- Strengthened Codex plugin validation so the Nuzo skill must keep explicit
  save requests on the `memory.suggest_capture` to confirmed `memory.remember`
  path.
- Strengthened MCP session-continuity smoke validation so rejected inferred
  capture drafts must remain absent from later recall results.
- Strengthened MCP session-continuity smoke validation for confirmed capture
  updates and stale `expected_revision` conflicts.
- MCP `memory.update` now returns structured Nuzo memory errors for stale
  revision conflicts.
- Simplified the MCP server npm README command so direct installs omit a
  release number, while generated host plugin artifacts remain version-pinned.

### Fixed

- Added a release-version map and automated release validation for public docs
  so README, getting-started pages, npm publishing docs, and host plugin docs
  do not keep stale current-release versions after a release.

## [0.1.3] - 2026-06-24

### Documentation

- Documented the `0.1.3` focus on product polish, installation
  simplification, README/docs pruning, and public/private agent guidance.
- Polished the README and getting-started docs around a 60-second
  `@nuzo/memory-cli` install path and clearer CLI/MCP/core package roles.
- Shortened public agent guidance, kept local operator notes in ignored
  `AGENTS.local.md`, and removed `AGENTS.md` from the public contribution
  reading path.
- Documented Markdown naming conventions and refreshed the repository layout
  docs to match the current monorepo and package names.
- Reorganized the docs navigation around install, CLI, MCP, host plugins, and
  privacy before deeper product, architecture, and release-operation pages.
- Changed the user-facing install command to use the current CLI package
  instead of pinning a patch release in first-read docs.
- Polished the npm package READMEs for the CLI, MCP server, and core package
  so npm users see the same install and package-role guidance as the main docs.
- Clarified that published package and host plugin artifact smokes for a target
  version run after that version is available on npm, while pre-publish
  validation uses generated artifacts and npm package validation.

## [0.1.2] - 2026-06-24

### Added

- Published CLI session-continuity smoke for validating memory recall,
  read-only capture suggestions, duplicate detection, and doctor output through
  the package users install.
- Published MCP session-continuity smoke for validating recall across separate
  stdio server sessions, read-only capture suggestions, duplicate detection,
  and doctor output through the package host plugins resolve.
- Generated Codex plugin artifact smoke for validating `Nuzo` metadata and the
  version-pinned published MCP runtime exposed by the release-layout plugin.
- Generated Claude Code plugin artifact smoke for validating `Nuzo` metadata,
  `${CLAUDE_PLUGIN_ROOT}` cwd resolution, and the same published MCP runtime
  continuity flow.
- Capture suggestion candidate rules and core examples covering allowed,
  duplicate, blocked, rejected, and confirmed drafts without silent writes.

### Documentation

- Corrected published-package verification commands to use a temporary npm
  install prefix instead of `npm exec --package`, which does not expose the
  scoped CLI binary reliably.
- Documented the `0.1.2`, `0.2.0`, and post-`0.2.0` roadmap split around real
  workflow hardening, capture lifecycle UX, and optional semantics.
- Clarified that SQLite/local-first storage is a product boundary rather than a
  placeholder for cloud infrastructure.

## [0.1.1] - 2026-06-24

### Added

- Bounded core and MCP inputs for memory content, tags, sources, recall queries,
  destructive-action reasons, and import size.
- SQLite busy timeout and Unicode-aware recall tokenization.
- Secret scanning for npm access tokens.
- Installed npm artifact validation now performs CLI and MCP lifecycle checks
  for read-only capture suggestions, confirmed writes, recall hooks, exact tool
  discovery, and `memory.doctor`.
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
- CLI `nuzo memory suggest-capture` for read-only capture draft validation from
  local scripts and manual workflows.

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
