# Getting Started

Nuzo is currently design-first. There is no installable runtime package yet.

This page explains how to work with the repository today and how the first implementation is expected to behave.

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

## Planned Runtime Flow

The initial CLI is available after a build:

```bash
npm run build
node packages/cli/dist/index.js memory init
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

Until package binaries are wired for install, use:

```bash
node packages/cli/dist/index.js memory remember "The user prefers concise implementation notes." --kind preference
node packages/cli/dist/index.js memory update mem_01HZY --content "The user prefers concise implementation notes and explicit tradeoffs."
node packages/cli/dist/index.js memory recall "implementation notes"
```

## Safety Reminder

Runtime memory does not belong in Git.

The project should keep ignoring:

```text
.nuzo/memory/
*.memory.export.md
*.sqlite
*.sqlite-*
```
