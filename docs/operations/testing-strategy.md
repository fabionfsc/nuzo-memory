# Testing Strategy

Testing should protect the project contracts before implementation details.

Local gates that build, clean, package, or execute `packages/*/dist/` must run
sequentially. They intentionally share generated output, so parallel execution
can create false failures even when each command passes in isolation.

Test organization follows [ADR 0007](../adr/0007-test-organization.md):
package behavior tests stay near their packages, public contracts live with
their owning package, and test-only shared helpers are extracted only after
there are at least two real consumers.

Repeated validation work should become a script, shared fixture, or contract
helper once it appears in more than one place. Keep exact public contracts such
as the MCP tool set in one source of truth and import that source from tests,
packaging validation, and runtime diagnostics instead of copying lists by hand.

## Test Pyramid

1. Core unit tests.
2. Storage integration tests with temporary SQLite databases.
3. CLI contract tests.
4. MCP tool contract tests.
5. End-to-end smoke tests.

## Required MVP Tests

- init creates expected directories and database;
- init is idempotent;
- remember stores valid memories;
- remember rejects obvious secrets;
- secret scanning blocks common credential formats while allowing redacted examples;
- recall returns relevant FTS results;
- list filters by scope and tag;
- update records audit event;
- history returns only the requested memory's audit events;
- forget archives by default;
- hard delete requires explicit confirmation;
- bulk forget defaults to dry-run and isolates scope/tag filters;
- export produces valid versioned format;
- import dry-run reports planned changes;
- import preflight rejects the full request before writes and handles duplicate items consistently;
- SQLite mutations roll back memory, FTS, and audit writes after injected failures;
- multi-item imports are atomic when a later item fails;
- normal recall does not persist query text or usage metadata unless the core
  caller explicitly opts in;
- doctor reports tracked memory files.
- MCP doctor reports aggregate store health without exposing memory content.
- staged npm artifacts complete real installed CLI and stdio MCP lifecycle
  flows for capture suggestion, confirmed writes, recall hooks, the exact
  public tool set, and healthy `memory.doctor` responses.
- release-tool tests reject invalid SemVer and direct workflow input
  interpolation, and verify local npm credentials remain ignored.

## Test Data

Use fake memory content only.

Never place real user facts, credentials, or local project secrets in fixtures.

## Contract Tests

MCP and CLI should have snapshot-style contract tests for:

- input validation;
- output shape;
- error codes;
- warnings.

Snapshots should avoid timestamps and generated IDs unless normalized.

MCP protocol coverage connects an SDK `Client` and the Nuzo server through
`InMemoryTransport`. It asserts exact tool discovery, registered schema
defaults, representative JSON responses, and invalid-input rejection without
network access or a stdio subprocess.

Artifact validation reuses the MCP server's exported tool contract so new tools
do not require repeated manual updates across test files and release scripts.

CLI process coverage runs the built `dist/index.js` entrypoint in subprocesses
and asserts stable success, operational, usage, and internal exit codes plus
stack-trace-free stderr.

## Migration Tests

Each migration should be tested from:

- an empty store;
- the immediately previous schema;
- a small realistic fixture.

For schema version 2, migration tests verify an empty database, reopen a
populated store to confirm idempotency, and reject a fixture with a newer
unsupported `user_version`. Future schema bumps should add a fixture for the
immediately previous schema before changing `schemaVersion`.

## Manual Smoke Test

Before a release:

```bash
nuzo memory init
nuzo memory remember "The user prefers local-first tools." --kind preference --tag example
nuzo memory recall "local-first"
nuzo memory list
nuzo memory export --path ./memories.memory.export.json
nuzo memory doctor
```

Smoke tests may set `NUZO_DOCTOR_SKIP_GIT=1` so restricted environments do not
warn only because Git tracking inspection is unavailable. Tests should still
cover normal warning behavior for missing stores and tracked memory files.

MCP doctor tests should cover both ok and warning states. They must assert that
diagnostics include aggregate counts, store readability/writability, and schema
status, but not memory content.

## Continuous Integration

GitHub Actions runs validation from:

```text
.github/workflows/ci.yml
```

The workflow runs on pull requests, pushes to `main`, and manual dispatch.

Node validation uses the lockfile on Node.js 22 LTS and 24 LTS and runs:

```bash
npm ci
npm run check
npm run release:check
npm test
npm run build
npm run package:plugins
npm run validate:npm
npm run smoke:cli
npm run smoke:published:cli
npm run smoke:published:mcp
```

Manual dispatch can also run a release rehearsal job. It uses Node.js 24 and
executes:

```bash
npm run release:rehearse -- X.Y.Z
```

Manual dispatch requires an explicit rehearsal version.

Release-state validation confirms that root/workspace versions, Nuzo internal
dependency pins, lockfile workspace entries, CLI version output, MCP server
version metadata, and changelog structure stay aligned.

The npm artifact validation installs generated core, CLI, and MCP tarballs into
a temporary project. It exercises the installed CLI workflow, read-only capture
suggestions, confirmed writes, recall, and exit codes, then confirms the
installed MCP binary starts and supports the same suggestion-to-recall lifecycle
over stdio. It does not publish packages or require npm credentials.

The published CLI smoke installs `@nuzo/memory-cli` into a temporary npm prefix
and validates session continuity through separate `nuzo` process invocations.
It is a post-release confidence check for the package users install, not a
replacement for staged artifact validation before publication.

The published MCP smoke installs `@nuzo/mcp-server` into a temporary npm prefix
and validates session continuity through separate stdio server processes. It is
the package-level confidence check for the runtime host plugins resolve.

Documentation validation installs `requirements-docs.txt` and runs:

```bash
mkdocs build --strict
```

CI does not deploy GitHub Pages and only receives read access to repository contents.

The matrix is the supported Node.js policy for the MVP. The `package.json`
engine declarations provide a minimum version guard, while CI defines the
major versions Nuzo actively claims and tests.

`npm audit --audit-level=moderate` remains a dependency-change and release gate. Advisory changes outside the repository should not make ordinary pull requests nondeterministically fail.
