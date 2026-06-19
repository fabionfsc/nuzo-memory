# Testing Strategy

Testing should protect the project contracts before implementation details.

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
- doctor reports tracked memory files.
- MCP doctor reports aggregate store health without exposing memory content.

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

CLI process coverage runs the built `dist/index.js` entrypoint in subprocesses
and asserts stable success, operational, usage, and internal exit codes plus
stack-trace-free stderr.

## Migration Tests

Each migration should be tested from:

- an empty store;
- the immediately previous schema;
- a small realistic fixture.

For schema version 1, the empty database is the previous state. Migration tests
also reopen a populated version 1 database to verify idempotency and reject a
fixture with a newer unsupported `user_version`.

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
diagnostics include aggregate counts and store readability, but not memory
content.

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
```

Release-state validation confirms that root/workspace versions, Nuzo internal
dependency pins, lockfile workspace entries, CLI version output, MCP server
version metadata, and changelog structure stay aligned.

The npm artifact validation installs generated core and MCP tarballs into a
temporary project and confirms the installed MCP binary starts. It does not
publish packages or require npm credentials.

Documentation validation installs `requirements-docs.txt` and runs:

```bash
mkdocs build --strict
```

CI does not deploy GitHub Pages and only receives read access to repository contents.

The matrix is the supported Node.js policy for the MVP. The `package.json`
engine declarations provide a minimum version guard, while CI defines the
major versions Nuzo actively claims and tests.

`npm audit --audit-level=moderate` remains a dependency-change and release gate. Advisory changes outside the repository should not make ordinary pull requests nondeterministically fail.
