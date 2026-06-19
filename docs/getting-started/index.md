# Getting Started

Nuzo is in early MVP development.

This page explains how to work with the repository today and how to run the local CLI from the monorepo.

## Read The Project

Start with:

1. `README.md`
2. `AGENTS.md`
3. `docs/architecture/overview.md`
4. `docs/architecture/boundaries.md`
5. `docs/spec/tools.md`
6. `docs/operations/roadmap.md`

## Work On Documentation

Create a local docs environment:

```bash
python3 -m venv .venv-docs
.venv-docs/bin/pip install -r requirements-docs.txt
```

Serve locally:

```bash
.venv-docs/bin/mkdocs serve
```

Validate:

```bash
.venv-docs/bin/mkdocs build --strict
```

## Work On The TypeScript Workspace

Use Node.js 22 LTS or 24 LTS with npm 10 or newer. These are the runtime lines
validated in CI. See [Runtime Support](../operations/runtime-support.md) for
the full policy and native SQLite troubleshooting.

Install dependencies:

```bash
npm install
```

Type-check:

```bash
npm run check
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## Local Runtime Flow

The workspace CLI is available after a build:

```bash
npm run build
npm run nuzo -- memory init
```

Initialize project-local memory with:

```bash
npm run nuzo -- memory init --project
```

The first user-facing command is:

```bash
nuzo memory init
```

It should create:

```text
~/.nuzo/
├── config.json
└── memory/
    ├── memories.sqlite
    ├── exports/
    └── logs/
```

After that, the expected flow is:

```bash
nuzo memory remember "The user prefers concise implementation notes." --kind preference
nuzo memory update mem_01HZY --content "The user prefers concise implementation notes and explicit tradeoffs."
nuzo memory recall "How should the assistant write implementation notes?"
nuzo memory list
nuzo memory forget mem_01HZY
```

Until release packaging is finalized, use the workspace wrapper:

```bash
npm run nuzo -- memory remember "The user prefers concise implementation notes." --kind preference
npm run nuzo -- memory update mem_01HZY --content "The user prefers concise implementation notes and explicit tradeoffs."
npm run nuzo -- memory recall "implementation notes"
npm run nuzo -- memory export --path ./memories.memory.export.md
```

See `docs/operations/local-cli.md` for the current CLI packaging direction.

For a clean checkout walkthrough that exercises install, build, remember, recall, export, and import, see `docs/getting-started/clean-install.md`.

## Safety Reminder

Runtime memory does not belong in Git.

The project should keep ignoring:

```text
.nuzo/memory/
*.memory.export.md
*.memory.export.json
*.sqlite
*.sqlite-*
```
