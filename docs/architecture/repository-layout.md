# Repository Layout

This repository is a small TypeScript monorepo with documentation, runtime
packages, host plugin source, and release tooling.

## Current Layout

```text
.
├── .github/
├── docs/
│   ├── adr/
│   ├── architecture/
│   ├── assets/
│   ├── getting-started/
│   ├── operations/
│   ├── product/
│   └── spec/
├── packages/
│   ├── claude-code-plugin/
│   ├── cli/
│   ├── codex-plugin/
│   ├── core/
│   ├── memory/
│   └── mcp-server/
├── tools/
├── AGENTS.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── README.md
└── SECURITY.md
```

## Documentation Rules

- Product decisions live in `docs/product/`.
- System design lives in `docs/architecture/`.
- Tool contracts and file formats live in `docs/spec/`.
- Release and operational practices live in `docs/operations/`.
- Durable decisions live in `docs/adr/`.
- Root Markdown files are short entry points for humans, contributors, agents,
  security, and release history.
- Package `README.md` files describe package-specific usage only.
- Generated docs output belongs in `site/` and must stay untracked.

## Markdown Naming

Use these conventions:

- root entry files use uppercase conventional names, such as `README.md`,
  `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, and `AGENTS.md`;
- docs pages under `docs/` use lowercase kebab-case names;
- ADRs use numeric lowercase names under `docs/adr/`;
- package entry docs use `README.md`;
- host-agent skills use host-required `SKILL.md`;
- local-only agent/operator notes use ignored `AGENTS.local.md`;
- runtime memory exports use ignored `*.memory.export.md` or
  `*.memory.export.json`.

Do not add a new Markdown file when an existing page can own the content
cleanly. Prefer merging small operational notes into the relevant docs page.

## Naming

- Repository name: `nuzo-memory`.
- CLI command: `nuzo memory`.
- User package: `@nuzo/memory`.
- Core package: `@nuzo/memory-core`.
- Legacy transition packages: `@nuzo/memory-cli` and `@nuzo/mcp-server`.
- Host plugin display name: `Nuzo`.
- Default config directory: `~/.nuzo/`.
