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

## Project-Level Init

Command:

```bash
nuzo memory init --project
```

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

## Idempotency

Running init multiple times should be safe.

Rules:

- never delete an existing database;
- never rotate or rewrite memory IDs;
- apply missing migrations only;
- append missing `.gitignore` rules without duplicating them;
- report existing paths clearly.

## Output Contract

Successful output should include:

```text
Nuzo Memory initialized
Store: ~/.nuzo/memory/memories.sqlite
Scope: user:default
Network: disabled
```
