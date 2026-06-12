# Coding Standards

These standards apply when code is added.

## General

- Keep business logic in `packages/core`.
- Prefer small functions with explicit inputs and outputs.
- Avoid global mutable state.
- Avoid hidden network calls.
- Return structured errors from core logic.
- Convert structured errors to user-facing text at interface boundaries.

## Configuration

Configuration should resolve in one place.

Resolution order:

1. CLI flags or MCP arguments.
2. Environment variables.
3. Project config.
4. User config.
5. Defaults.

Resolved configuration should be passed into core services explicitly.

## Errors

Core errors should include:

- stable code;
- message;
- optional details;
- suggested recovery.

Example:

```json
{
  "code": "MEMORY_STORE_NOT_FOUND",
  "message": "Memory store was not initialized.",
  "suggestion": "Run nuzo memory init."
}
```

## Logging

- Do not log memory content by default.
- Do not log secrets.
- Use debug logs for paths and config resolution.
- Use audit events for memory lifecycle changes.

## Security Defaults

- Network disabled by default.
- Telemetry absent by default.
- Destructive actions require explicit confirmation.
- Runtime memory files ignored by Git.

## Documentation

Every new public command or MCP tool must update:

- `docs/spec/tools.md`;
- README quick-start when relevant;
- tests for the public contract.
