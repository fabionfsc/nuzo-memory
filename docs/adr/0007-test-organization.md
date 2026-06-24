# ADR 0007: Test Organization

## Status

Accepted.

## Context

Nuzo has package-local behavior tests in:

- `packages/core/src/__tests__/`;
- `packages/cli/src/__tests__/`;
- `packages/mcp-server/src/__tests__/`.

Repository automation and release validation live in `tools/`.

The project also has contracts consumed by more than one place. The MCP public
tool list is used by runtime diagnostics, protocol tests, and npm artifact
validation.

## Decision

Keep behavior tests close to the package they validate.

Do not create a top-level `tests/` directory for the current codebase. The
existing package-local layout gives better ownership and keeps fixtures near
the implementation they exercise.

When a fixture, expected value, or helper is consumed by at least two packages
or scripts, extract it into the narrowest durable owner:

- public runtime contracts belong in the package that owns the contract;
- release and repository automation helpers belong in `tools/`;
- test-only helpers that have no runtime owner may use `test-support/` after
  there are at least two real consumers.

The MCP tool-name list is a public runtime contract, so it belongs in
`packages/mcp-server/src/tool-contract.ts` and is imported by runtime
diagnostics, protocol tests, and npm artifact validation.

## Consequences

- Tests remain easy to navigate from the package under change.
- Shared contracts avoid copied lists that drift during feature work.
- A future `test-support/` directory is allowed, but only when it removes real
  duplication and does not become a dumping ground for package-specific tests.
- Runtime packages must not import from test-only directories.
