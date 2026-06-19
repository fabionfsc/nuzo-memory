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

The scanner includes npm access-token prefixes in addition to the provider
patterns above.

## Local File Protection

Nuzo-created databases, SQLite sidecars, config files, and exports are
owner-readable/writable only (`0600`). Nuzo-created memory, export, and log
directories use `0700`.

Project `.nuzo/config.json` cannot redirect storage to an absolute path,
traverse outside the project, or resolve through a symlinked `.nuzo` path.

## Scope Isolation

Nuzo scopes are selectors, not security principals in `0.1.x`. Any process
that can use a store may be able to request multiple scopes or unscoped
operations. Use a separate SQLite store for workloads that require isolation
between hosts, projects, teams, or trust levels.

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

JSON imports are limited to 1,000 memories and CLI import files are limited to
10 MiB. Memory content, tags, sources, queries, and destructive-action reasons
also have bounded inputs.
