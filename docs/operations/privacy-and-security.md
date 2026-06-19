# Privacy And Security

## Default Privacy Model

Nuzo stores memory locally by default.

The default configuration must not:

- send memories to a remote server;
- call remote embedding APIs;
- enable telemetry;
- sync with Git;
- expose an HTTP server.

## Git Safety

The repository should include ignore rules for local runtime memory:

```gitignore
.nuzo/memory/
.nuzo/**/*.sqlite
.nuzo/**/*.sqlite-*
*.memory.export.md
*.memory.export.json
```

The CLI should warn when memory files are tracked by Git.

## Sensitive Data Policy

The system should reject or warn on likely sensitive data:

- passwords;
- API keys;
- OAuth tokens;
- SSH private keys;
- database URLs containing credentials;
- cookies;
- private personal identifiers unless explicitly allowed.

The MVP scanner uses local, high-confidence patterns for private key headers,
GitHub and common provider keys, AWS access keys, JWTs, bearer tokens,
credential-bearing database URLs, and cookie/session assignments. It allows
redacted placeholders and environment-variable instructions so safe
documentation can still be remembered.

This scanner is a safety guard, not a complete data-loss-prevention system.
Users and host agents must still avoid sending private files or credentials to
memory tools.

## Auditability

Every memory should expose:

- ID;
- scope;
- kind;
- content;
- tags;
- source;
- created time;
- updated time;
- last used time, if enabled;
- event history.

## Destructive Actions

Hard deletes should require explicit confirmation in CLI and a specific MCP argument.

Recommended MCP field:

```json
{
  "mode": "delete",
  "confirm": true
}
```

## Backups

Backups should be explicit user actions.

The MVP supports:

- JSON export for round-trip import;
- Markdown export for review;
- dry-run import.
