# Getting Started

Nuzo `0.1.3` is the current public release.

Most users should start with the released CLI. Repository setup is only needed
when you want to contribute to Nuzo itself.

## Install The CLI

Use Node.js 22 LTS or 24 LTS with npm 10 or newer.

```bash
npm install --global @nuzo/memory-cli
nuzo memory init
nuzo memory doctor
```

Store and recall a fake memory:

```bash
nuzo memory remember "The demo project uses SQLite for local storage." --kind project_decision
nuzo memory recall "local storage"
```

The first user-facing command is:

```bash
nuzo memory init
```

It creates:

```text
~/.nuzo/
├── config.json
└── memory/
    ├── memories.sqlite
    ├── exports/
    └── logs/
```

Initialize project-local memory from a project root with:

```bash
nuzo memory init --project
```

## Choose A Package

You do not need to install every Nuzo package.

| Package | Use it when you need... |
| --- | --- |
| `@nuzo/memory-cli` | the `nuzo` command for local memory control. |
| `@nuzo/mcp-server` | an MCP stdio server for Codex, Claude Code, or another host. |
| `@nuzo/memory-core` | library-level integration or Nuzo package development. |

The CLI is the default starting point for humans. Host plugins and MCP clients
resolve the MCP server runtime when they need it.

## Read The Project

If you are evaluating or contributing to Nuzo, start with:

1. `README.md`
2. `CONTRIBUTING.md`
3. `docs/spec/tools.md`
4. `docs/operations/roadmap.md`
5. `docs/architecture/overview.md`

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

The workspace CLI is also available after a build:

```bash
npm run build
npm run nuzo -- memory init
```

After that, the expected flow is:

```bash
nuzo memory remember "The user prefers concise implementation notes." --kind preference
nuzo memory list
nuzo memory update mem_01HZY --expected-revision 1 --content "The user prefers concise implementation notes and explicit tradeoffs."
nuzo memory recall "How should the assistant write implementation notes?"
nuzo memory forget mem_01HZY --expected-revision 2
```

When developing from the repository, use the workspace wrapper:

```bash
npm run nuzo -- memory remember "The user prefers concise implementation notes." --kind preference
npm run nuzo -- memory list
npm run nuzo -- memory update mem_01HZY --expected-revision 1 --content "The user prefers concise implementation notes and explicit tradeoffs."
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
