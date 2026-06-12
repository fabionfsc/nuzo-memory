# Nuzo Memory

Nuzo Memory is a local-first, auditable memory layer for AI agents.

The goal is to give Codex and other MCP-compatible agents a managed memory system similar in spirit to ChatGPT memory, while keeping the user in control of what is stored, searched, exported, and deleted.

## Status

Design phase. This repository currently defines the architecture, product principles, memory model, tool contract, and implementation plan before code is introduced.

## Principles

- Local-first: user memories live outside the Git repository by default.
- Auditable: every saved memory can be listed, inspected, explained, exported, and deleted.
- Explicit control: the user can approve, reject, edit, or forget memories.
- Agent-compatible: expose memory through MCP first, with CLI and optional HTTP interfaces.
- Portable: use documented storage formats and migration paths.
- Private by default: no cloud sync, telemetry, or remote model dependency unless configured.

## Repository Layout

```text
nuzo/
├── README.md
├── docs/
│   ├── product/
│   │   ├── vision.md
│   │   └── requirements.md
│   ├── architecture/
│   │   ├── overview.md
│   │   ├── storage.md
│   │   ├── boundaries.md
│   │   └── repository-layout.md
│   ├── spec/
│   │   ├── memory-model.md
│   │   ├── tools.md
│   │   ├── api-versioning.md
│   │   └── init.md
│   ├── operations/
│   │   ├── privacy-and-security.md
│   │   ├── coding-standards.md
│   │   ├── testing-strategy.md
│   │   ├── roadmap.md
│   │   └── github-release-plan.md
│   └── adr/
│       ├── 0001-local-first.md
│       ├── 0002-sqlite-first.md
│       ├── 0003-mcp-first.md
│       ├── 0004-package-boundaries.md
│       └── 0005-stable-tool-contracts.md
└── examples/
    └── memory.export.example.md
```

Future code is expected to follow this shape:

```text
packages/
├── core/
├── cli/
├── mcp-server/
└── codex-plugin/
```

## Local Memory Location

Runtime memory should not be committed to Git.

Default user-level location:

```text
~/.nuzo/memory/
├── memories.sqlite
├── exports/
└── logs/
```

Optional project-level location:

```text
<project>/.nuzo/memory/
├── memories.sqlite
└── config.json
```

## Initial Interfaces

- MCP server for agents.
- CLI for direct user control.
- Documented export/import format.
- Codex plugin wrapper after the MCP server is stable.

## Read Order

1. `docs/product/vision.md`
2. `docs/product/requirements.md`
3. `docs/architecture/overview.md`
4. `docs/architecture/boundaries.md`
5. `docs/spec/memory-model.md`
6. `docs/spec/tools.md`
7. `docs/spec/init.md`
8. `docs/operations/roadmap.md`

## Domain

The public documentation and project site can live at:

```text
https://nuzo.com.br
```

GitHub Pages is configured with MkDocs Material:

```text
mkdocs.yml
.github/workflows/pages.yml
docs/CNAME
```

See `docs/operations/github-pages.md`.

## License

License is not selected yet. See `docs/operations/github-release-plan.md` before publishing.
