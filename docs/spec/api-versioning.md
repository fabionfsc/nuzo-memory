# API Versioning

Nuzo has three public contracts:

- memory export format;
- MCP tool contract;
- CLI behavior;
- `@nuzo/memory-core` root API surface.

The `@nuzo/memory-core` root API surface is classified in
[Memory Core API](memory-core-api.md). The optional embedding-provider and
semantic-index interfaces are public experimental library contracts while Nuzo
is pre-`1.0.0`. They follow package SemVer. Provider fingerprints separately
version model compatibility and never replace the package version.

These contracts should be versioned from the first implementation.

## Version Numbers

Use semantic versioning for packages:

```text
0.x.y during active MVP development
1.0.0 when storage, CLI, and MCP contracts are stable
```

Use explicit schema versions for data:

```json
{
  "version": 1
}
```

## MCP Tool Compatibility

Tool names should be stable.

Breaking changes:

- renaming a tool;
- removing an input field;
- changing the meaning of a field;
- changing output shape in a way agents cannot tolerate;
- changing default destructive behavior.

Non-breaking changes:

- adding optional input fields;
- adding output fields;
- adding warnings;
- adding new tools.

### MCP Stability Classification

Stable:

- tool names listed in [Tool Contract](tools.md);
- input field names, validation ranges, defaults, and destructive confirmation
  requirements;
- JSON output field names documented in [Tool Contract](tools.md);
- domain-error `code` values and the `{ code, message, details? }` envelope;
- FTS as the omitted/default retrieval mode.

Experimental before `1.0.0`:

- optional semantic and hybrid retrieval diagnostics;
- bounded capture relationship evidence fields;
- host lifecycle recall hook behavior outside the MCP tool response itself.

Deprecated:

- no MCP tool or field is currently deprecated.

MCP domain errors use a JSON text envelope:

```json
{
  "code": "MEMORY_SCOPE_FORBIDDEN",
  "message": "Memory scope is not authorized.",
  "details": {
    "scope": "project:nuzo"
  }
}
```

`code` is the stable machine-readable field. `message` may be clarified
compatibly. `details` is optional and must be omitted when it could reveal
unauthorized memory metadata.

## Memory Core API Compatibility

The root `@nuzo/memory-core` entrypoint is explicit and documented. Breaking
changes include:

- removing a documented root export;
- changing a stable public type or value incompatibly;
- changing the meaning of `NuzoMemoryError.code`;
- changing default local-first, no-network behavior.

Non-breaking changes include:

- adding a new root export and documenting its stability class;
- adding optional fields to input or result types;
- clarifying human-readable error messages without changing codes.

## CLI Compatibility

Stable:

- command and option names documented in [Local CLI](../operations/local-cli.md);
- exit codes `0`, `1`, `2`, and `70`;
- `NUZO_INTERNAL_ERROR` for unexpected internal CLI failures;
- JSON field names emitted by `--json` commands;
- versioned JSON export documents.

Experimental before `1.0.0`:

- optional semantic diagnostics in `memory recall --json`;
- bounded capture relationship evidence in `memory suggest-capture --json`.

Deprecated:

- no CLI command, option, exit code, or JSON field is currently deprecated.

Human-readable non-JSON CLI text may be clarified compatibly. Scripts should
prefer documented flags, exit codes, structured error codes, and `--json` output
where available.

## Export Format Compatibility

Every export file must include:

```json
{
  "format": "nuzo-memory-export",
  "version": 1
}
```

Importers should reject unknown major versions and explain why.

## Storage Migrations

Database schema migrations should be:

- ordered;
- idempotent;
- tested from empty database;
- tested from previous schema;
- never dependent on network access.

## Deprecation

Deprecated fields should remain accepted for at least one minor release after replacement.

The CLI should print warnings for deprecated user-facing options.
