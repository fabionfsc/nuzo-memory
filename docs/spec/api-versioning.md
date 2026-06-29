# API Versioning

Nuzo has three public contracts:

- memory export format;
- MCP tool contract;
- CLI behavior.

The optional embedding-provider and semantic-index interfaces are also public
library contracts once exported by `@nuzo/memory-core`. They follow package
SemVer. Provider fingerprints separately version model compatibility and never
replace the package version.

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
