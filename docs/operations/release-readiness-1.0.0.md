# 1.0.0 Release Readiness Audit

Date: 2026-07-03

This audit checks whether Nuzo is ready to enter the `1.0.0` release process.
It does not prepare the source version, create a tag or GitHub release, publish
an npm package, or publish a host plugin.

## Decision

Nuzo is ready for a focused `1.0.0` release pull request. No known open issue
currently blocks data integrity, scope isolation, confirmed capture,
migrations, supported hosts, or the documented package boundary.

The source checkout and current public release remain at `0.9.1`. The
`1.0.0 Stable Release` milestone remains open until the exact stable artifacts
are published and post-release validation is complete.

## Passed Pre-Release Evidence

### Scope And Tracking

- No open `priority:p0`, `priority:p1`, or other executable issue remained
  before this audit issue was opened.
- All four implementation issues previously assigned to the
  `1.0.0 Stable Release` milestone were closed with evidence; issue #255 tracks
  this final audit and closes with its documentation pull request.
- The completed `0.9.0 Contract Stabilization` milestone was closed with all
  22 issues complete.
- The public release remains `0.9.1`; no `1.0.0` tag, package, or GitHub
  release was created during this audit.

### Release Tooling And Artifacts

- `npm run release:rehearse -- 1.0.0` passed in its isolated temporary
  checkout.
- The official [CI workflow-dispatch rehearsal](https://github.com/fabionfsc/nuzo-memory/actions/runs/28686512908)
  completed successfully, including the dedicated `Release rehearsal` job for
  `1.0.0` and the full validation matrix.
- The rehearsal prepared and checked the synthetic `1.0.0` version, generated
  both host plugins, and validated staged `@nuzo/memory-core@1.0.0` and
  `@nuzo/memory@1.0.0` tarballs.
- Package policy selected only `@nuzo/memory-core` and `@nuzo/memory` for
  `1.0.0`; the legacy CLI and MCP npm packages remained retired.
- The source worktree stayed at `0.9.1` after the rehearsal.

### Current Published Baseline

- Published CLI and MCP continuity smokes passed against
  `@nuzo/memory@0.9.1`.
- The published optional-semantics smoke passed its default no-model fallback.
- Both current public packages expose npm provenance attestations.
- The final `@nuzo/memory-cli@0.9.0` and `@nuzo/mcp-server@0.9.0` packages
  carry migration deprecation messages.

### Dependencies And Supply Chain

- `npm audit --audit-level=moderate` reported zero vulnerabilities.
- `npm audit signatures` verified registry signatures for 177 packages and
  attestations for 31 packages.
- `npm outdated` found no newer required dependency; the missing
  `@huggingface/transformers@4.2.0` entries are the intentional optional peer.
- Workflow action inputs and reviewed npm tool inputs passed the repository
  supply-chain gate.

### Repository Governance

- `main` requires pull requests, strict current-branch checks, linear history,
  and enforcement for administrators.
- Required checks are Node.js 22, Node.js 24, documentation validation, and
  CodeQL analysis.
- Dependabot security updates, secret scanning, and push protection are
  enabled.
- Dependabot and secret-scanning APIs reported zero open alerts.
- Merged same-repository branches are deleted automatically.

### Supported Matrix

The required staged-artifact lanes pass for:

- Ubuntu x64 with Node.js 22 and 24;
- macOS x64 with Node.js 22 and 24;
- Windows x64 with Node.js 22 and 24.

The standard CI gates also cover package checks, tests, release consistency,
recall and capture benchmarks, optional-semantics benchmarks, npm and plugin
packaging, the developer-experience gate, native Codex marketplace
installation, CLI recovery, lifecycle hooks, and Codex and Claude Code plugin
smokes.

## Required At Release Time

These steps cannot be completed by a no-release audit:

1. Open a focused release pull request that creates the dated `1.0.0`
   changelog section and runs `npm run release:prepare -- 1.0.0`.
2. Re-run the complete release checklist against that exact release commit.
3. Confirm `1.0.0` is still absent from both npm packages and verify the two
   trusted-publisher settings immediately before publishing.
4. Publish `@nuzo/memory-core@1.0.0` and then `@nuzo/memory@1.0.0` through the
   protected `release-npm.yml` OIDC workflow.
5. Run the published CLI, MCP, optional-semantics, Codex, Claude Code, and host
   canaries against the exact `1.0.0` artifacts.
6. Create the `v1.0.0` tag and GitHub release from the matching changelog
   section, then complete the post-release validation record.

Until those steps pass, this audit means **ready to release**, not
**released**.

## Evidence Links

- [Audit tracking issue #255](https://github.com/fabionfsc/nuzo-memory/issues/255)
- [Official `1.0.0` CI rehearsal](https://github.com/fabionfsc/nuzo-memory/actions/runs/28686512908)
- [Release checklist](release-checklist.md)
- [Versioning policy](versioning.md)
- [npm publishing procedure](npm-publishing.md)
- [Developer experience contract](developer-experience-1.0.0.md)
- [Codebase audit](codebase-audit-1.0.0.md)
