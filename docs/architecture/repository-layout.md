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

`tools/` is intentionally committed to GitHub. It contains repository
automation, benchmarks, release checks, artifact packaging, and smoke tests
needed to reproduce public validation. It is not a runtime package surface:
npm staging copies only package `dist/`, `README.md`, and `LICENSE` files into
publishable artifacts, and `npm pack` validation rejects tests, local stores,
exports, credentials, and other non-runtime files.

Root hidden plugin directories are intentionally host-specific:

- `.agents/plugins/marketplace.json` is the Codex marketplace catalog entry.
- `.claude-plugin/marketplace.json` is the Claude Code marketplace catalog
  entry.
- `packages/codex-plugin/.codex-plugin/plugin.json` and
  `packages/claude-code-plugin/.claude-plugin/plugin.json` are the plugin
  manifests expected inside each installable host plugin.

Do not collapse these into a repository-private directory such as `.plugins/`
unless the host CLIs add support for that layout. The duplicated-looking names
are discovery contracts for different hosts, not runtime source structure.

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
  These remain source packages, but their final planned public npm release is
  `0.9.0`; `1.0.0` and later public releases publish only `@nuzo/memory-core`
  and `@nuzo/memory`.
- Host plugin display name: `Nuzo`.
- Default config directory: `~/.nuzo/`.
