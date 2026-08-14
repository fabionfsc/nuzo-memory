<h1 align="center">Nuzo</h1>

<p align="center">
  <strong>Local-first, auditable memory for AI agents.</strong><br>
  Durable context for Codex, Claude Code, and MCP-compatible hosts—without turning memory into hidden state.
</p>

<p align="center">
  <a href="https://github.com/fabionfsc/nuzo-memory/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/fabionfsc/nuzo-memory/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/fabionfsc/nuzo-memory/actions/workflows/pages.yml"><img alt="Docs" src="https://github.com/fabionfsc/nuzo-memory/actions/workflows/pages.yml/badge.svg"></a>
  <a href="https://github.com/fabionfsc/nuzo-memory/releases/tag/v1.1.0"><img alt="Release 1.1.0" src="https://img.shields.io/badge/release-v1.1.0-22c55e"></a>
  <a href="#license"><img alt="Apache 2.0 license" src="https://img.shields.io/badge/license-Apache--2.0-64748b"></a>
</p>

<p align="center">
  <a href="https://nuzo.com.br/getting-started/">Install</a> ·
  <a href="https://nuzo.com.br/getting-started/sixty-second-demo/">60-second demo</a> ·
  <a href="https://nuzo.com.br/product/why-nuzo/">Why Nuzo?</a> ·
  <a href="https://nuzo.com.br/operations/privacy-and-security/">Security</a> ·
  <a href="https://nuzo.com.br/spec/tools/">MCP contract</a>
</p>

Nuzo keeps scoped memories in local SQLite. Agents can recall bounded context
across sessions, while you retain a CLI and public MCP contract to inspect,
update, export, archive, or delete every record. Inferred memories remain
drafts until you confirm them; recalled content remains untrusted data.

> [!IMPORTANT]
> Nuzo `1.2.0` is the final planned release. The repository becomes read-only
> after publication, and no ongoing maintenance or security response is
> promised. Published packages remain available for reproducible use and
> forking. See the [end-of-maintenance notice](docs/operations/end-of-maintenance.md).

## Quick Start

Use Node.js 22 LTS or 24 LTS with npm 10 or newer:

```bash
npm install --global @nuzo/memory@1.1.0
nuzo setup
```

`nuzo setup` detects Codex and Claude Code, previews host changes, and asks
before writing configuration. To evaluate Nuzo without configuring a host or
touching your normal store, run the
[disposable 60-second demo](docs/getting-started/sixty-second-demo.md).

Two read-only recall hooks are expected: `SessionStart` and
`UserPromptSubmit`. They do not write memory.

<details>
<summary>Non-interactive setup and upgrade commands</summary>

```bash
nuzo setup --codex --yes
nuzo setup --claude-code --yes
nuzo setup --all --yes
nuzo update --yes
nuzo memory manage
```

</details>

## The Memory Loop

Automatic host hooks only recall. Explicit requests can write directly;
inferred capture uses a visible suggest-and-confirm flow. The same core policy
applies through the CLI, MCP server, and supported host integrations.

```bash
nuzo memory remember "The demo project uses SQLite." \
  --kind project_decision --tag demo
nuzo memory recall "demo storage"
```

## Proof, Not Promises

| Claim | Repository contract |
| --- | --- |
| Local by default | SQLite and SQLite FTS are canonical; telemetry and network embeddings are off by default. |
| Auditable lifecycle | MCP tools cover history and audit alongside update, archive, delete, export, and import. |
| Explicit inferred writes | Capture suggestions report `memory_writes: false`; confirmation is a separate tool. |
| Read-only automatic recall | Host hooks open existing stores read-only and fail open without writing application state. |
| Tested releases | Node 22, Node 24, docs, CodeQL, package validation, and host smoke gates are required before merge. |

Inspect the [memory model](docs/spec/memory-model.md),
[MCP tool contract](docs/spec/tools.md),
[trust boundary](docs/architecture/memory-trust-boundary.md), and
[release checklist](docs/operations/release-checklist.md).

## When Nuzo Fits

Choose Nuzo when individual memories need scopes, provenance, review state,
relations, audit history, bounded recall, or reuse across supported hosts.

Keep shared repository instructions in `AGENTS.md`. Use a short `MEMORY.md`
when manual curation is enough. Nuzo is not a cloud sync service, team
knowledge base, autonomous profile builder, or hosted dashboard.

Read the full [decision guide](docs/product/why-nuzo.md) and
[architecture overview](docs/architecture/overview.md).

## Packages

| Package | Intended use |
| --- | --- |
| `@nuzo/memory` | Recommended install: CLI, MCP server, and host hook runtime. |
| `@nuzo/memory-core` | Library-level integrations. |

Source workspace packages remain private. Public packages are generated and
validated through the documented release process.

## Project Status

The `1.2.0` release closes the planned roadmap. The repository is retained as
an auditable reference and is not accepting new feature work. Existing users
should pin an exact version and evaluate a maintained alternative or fork for
future runtime and dependency changes. Never publish real memory data,
credentials, or exports when discussing or forking Nuzo.

## License

Nuzo is licensed under the [Apache License 2.0](LICENSE).
