# Init Specification

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
  }
}
```

## Runtime Precedence

The CLI resolves settings in this order:

1. explicit command flags;
2. project `.nuzo/config.json`, when present in the current project root;
3. user `~/.nuzo/config.json`;
4. built-in defaults.

Project config is authoritative when present, so an unrelated user config is
not read or allowed to block the project.

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
