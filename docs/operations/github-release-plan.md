# GitHub Release Plan

## Repository

Recommended repository name:

```text
nuzo-memory
```

Alternative:

```text
nuzo
```

## Public Positioning

Short description:

```text
Local-first, auditable memory for Codex and MCP-compatible AI agents.
```

Topics:

```text
ai-agents
mcp
memory
codex
local-first
sqlite
developer-tools
```

## Before First Public Push

- Choose license.
- Add `.gitignore`.
- Add `SECURITY.md`.
- Add `CONTRIBUTING.md`.
- Add code of conduct only if community contributions are expected immediately.
- Confirm no local memory databases or exports are tracked.
- Add example exports with fake data only.

## Documentation Site

Primary domain:

```text
https://nuzo.com.br
```

Recommended first docs pages:

- Overview.
- Installation.
- Quick start.
- MCP setup.
- Codex setup.
- CLI reference.
- Privacy model.
- Memory file format.

The initial GitHub Pages setup is defined in `docs/operations/github-pages.md`.

## Release Stages

### Stage 0: Design

- Documentation in this repository.
- No runtime code.
- Validate architecture and naming.

### Stage 1: MVP

- Core package.
- SQLite store.
- CLI.
- MCP server.
- Basic tests.

### Stage 2: Codex Plugin

- `.codex-plugin/plugin.json`.
- Plugin README.
- Install/update docs.
- MCP server packaged through plugin defaults.

### Stage 3: Public Docs

- Publish docs under `nuzo.com.br`.
- Add install script only after manual install is stable.

## License Candidates

- Apache-2.0: permissive, patent grant, good for infrastructure.
- MIT: simple and permissive.

Recommendation: Apache-2.0 if the project may become infrastructure used by teams.
