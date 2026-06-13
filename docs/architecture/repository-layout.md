# Repository Layout

This repository starts documentation-first and should grow into a small monorepo.

## Current Layout

```text
docs/
├── product/
├── architecture/
├── spec/
├── operations/
└── adr/
examples/
README.md
```

## Current Implementation Scaffold

```text
packages/
└── core/
    ├── src/
    │   └── index.ts
    ├── package.json
    └── tsconfig.json
```

## Future Layout

```text
packages/
├── core/
│   ├── src/
│   └── tests/
├── cli/
│   ├── src/
│   └── tests/
├── mcp-server/
│   ├── src/
│   └── tests/
└── codex-plugin/
    ├── .codex-plugin/
    ├── skills/
    ├── scripts/
    └── README.md
```

## Documentation Rules

- Product decisions live in `docs/product/`.
- System design lives in `docs/architecture/`.
- Tool contracts and file formats live in `docs/spec/`.
- Release and operational practices live in `docs/operations/`.
- Durable decisions live in `docs/adr/`.

## Naming

- Repository name: `nuzo` or `nuzo-memory`.
- CLI command: `nuzo memory`.
- MCP server package: `nuzo-memory-mcp`.
- Codex plugin name: `nuzo`.
- Default config directory: `~/.nuzo/`.
