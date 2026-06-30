# Init Specification

The effective authorization and ancestor-discovery additions in this document
target `0.9.0`; `0.8.1` remains the current public release.

`nuzo memory init` prepares a local memory store.

## Goals

- Create required directories.
- Create or migrate the SQLite database.
- Write a minimal config file.
- Add or verify Git ignore rules.
- Print the active memory scope.
- Avoid overwriting existing memory.

## User-Level Init

Command:

```bash
nuzo memory init
```

Creates:

```text
~/.nuzo/
├── config.json
└── memory/
    ├── memories.sqlite
    ├── exports/
    └── logs/
```

User-level config stores an absolute path so runtime resolution is
deterministic. A leading `~/` is also accepted and resolves against the current
user home.

## Project-Level Init

Command:

```bash
nuzo memory init --project
```

The project scope is `project:<path-hash>`, derived from the canonical project
path without storing that path in the scope identifier.

After project init, CLI commands run from that project root automatically read
`.nuzo/config.json` and use its local store and default scope. Explicit
`--store` and `--scope` options override runtime resolution.

Project config stores `.nuzo/memory/memories.sqlite` as a relative path so it
does not leak a machine-specific project path and remains portable.

The v1 project config accepts only this relative storage path. Nuzo rejects
absolute paths, traversal, and symlinked `.nuzo` paths instead of allowing
repository-controlled config to redirect memory writes.

Creates:

```text
<project>/.nuzo/
├── config.json
└── memory/
    └── memories.sqlite
```

Updates project `.gitignore` with:

```gitignore
.nuzo/memory/
.nuzo/**/*.sqlite
.nuzo/**/*.sqlite-*
```

## Config Shape

```json
{
  "version": 1,
  "default_scope": "user:default",
  "storage": {
    "driver": "sqlite",
    "path": "~/.nuzo/memory/memories.sqlite"
  },
  "recall": {
    "limit": 8,
    "include_global": true
  },
  "privacy": {
    "allow_network": false,
    "record_recall_events": false
  },
  "authorization": {
    "mode": "restricted",
    "allowed_scopes": ["project:auto", "user:default"]
  }
}
```

`authorization` is accepted only in the trusted user config. A project config
cannot grant its host broader access. The local CLI is always an administrator
workflow; the authorization block controls published MCP and lifecycle-hook
host paths.

## Runtime Resolution

CLI, MCP server, and packaged host hook runtimes share the same effective
runtime resolver. This keeps local commands, direct MCP setup, and generated
host plugins pointed at the same store and default scope unless the operator
overrides them intentionally.

The resolver applies settings in this order:

1. explicit command flags;
2. runtime environment overrides;
3. project `.nuzo/config.json`, discovered from the current directory through
   its ancestors;
4. user `~/.nuzo/config.json`;
5. built-in defaults.

Project config is authoritative when present, so an unrelated user config is
not allowed to change its store, scope, recall, or privacy settings. A host may
still read the user config's authorization block because project-controlled
configuration is not a trusted source of access grants.

Project-root precedence is:

1. explicit runtime `projectRoot` option;
2. `NUZO_PROJECT_ROOT`;
3. nearest ancestor containing `.nuzo/config.json`;
4. the canonical current working directory.

The project root must be an existing directory. Nuzo derives `project:<hash>`
from its canonical path, so a nested session and a root session use the same
project scope.

Runtime environment overrides:

| Variable | Applies to | Purpose |
| --- | --- | --- |
| `NUZO_MEMORY_STORE` | CLI, MCP server, host hooks | Absolute or process-resolved path to the SQLite store. |
| `NUZO_MEMORY_SCOPE` | CLI, MCP server, host hooks | Default memory scope. `project:auto` resolves to the current project hash. |
| `NUZO_PROJECT_ROOT` | CLI, MCP server, host hooks | Exact existing project root; otherwise Nuzo discovers an ancestor project config. |
| `NUZO_AUTHORIZATION_MODE` | MCP server, host hooks | `restricted` or `administrator`. Published host entry points default to `restricted`. |
| `NUZO_AUTHORIZED_SCOPES` | MCP server, host hooks | Comma-separated allowlist. `project:auto` resolves against the effective project root. |

## Effective Authorization

Published MCP and hook entry points default to restricted access to the active
`project:<hash>` scope and `user:default`. The local CLI remains an explicit
administrator surface for inspecting and repairing the selected store.

Authorization precedence is:

1. explicit runtime options;
2. authorization environment variables;
3. trusted user `authorization` config;
4. the entry point's default mode.

Restricted mode requires at least one valid allowed scope. An explicitly
configured default scope outside the allowlist is rejected. If only the
built-in default conflicts, Nuzo selects the first authorized scope and reports
that adjustment through diagnostics. Global recall is disabled when
`user:default` is not authorized. Invalid or empty authorization input fails
closed.

`memory.doctor` and hook doctor report paths, effective scopes, authorization
mode, allowed scopes, and non-sensitive provenance. They never return config
file contents, credentials, environment values, or memory content.
| `NUZO_AUTHORIZED_SCOPES` | MCP server, host hooks | Comma-separated allowlist for restricted sessions. `project:auto` is allowed and resolves before core policy runs. |

`recall.limit` and `recall.include_global` provide defaults for
`nuzo memory recall`. `--limit`, `--include-global`, and
`--no-include-global` override them for one command.

`privacy.record_recall_events` controls whether normal CLI recall updates
`last_used_at` and appends `memory.recalled` audit events. It defaults to
`false`. `privacy.allow_network` must remain `false` in config version 1.

For compatibility, version 1 config files that omit `recall` or `privacy` use
the safe built-in defaults: limit `8`, no global inclusion, no recall-event
recording, and no network access.

## Idempotency

Running init multiple times should be safe.

Rules:

- never delete an existing database;
- never rotate or rewrite memory IDs;
- apply missing migrations only;
- append missing `.gitignore` rules without duplicating them;
- report existing paths clearly.
- create private runtime files with `0600` permissions and Nuzo-owned runtime
  directories with `0700` permissions.

Project init cannot be combined with a custom `--store` path. Choose either the
project layout or an explicit custom store.

## Output Contract

Successful output should include:

```text
Nuzo initialized
Store: ~/.nuzo/memory/memories.sqlite
Scope: user:default
Network: disabled
```
