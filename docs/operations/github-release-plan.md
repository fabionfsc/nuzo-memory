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

- Confirm Apache-2.0 license metadata.
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
- Official plugin setup docs.
- MCP server packaged through plugin defaults.

### Stage 3: Public Docs

- Publish docs under `nuzo.com.br`.
- Add development-only helper scripts only after the official plugin workflow is stable and documented.

## License

Nuzo uses Apache-2.0 because it is permissive, includes an explicit patent grant, and fits infrastructure that may be adopted by teams.
