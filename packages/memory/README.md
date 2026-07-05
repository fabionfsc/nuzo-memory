# @nuzo/memory

The official Nuzo runtime package for local, inspectable agent memory.

It installs:

- `nuzo`, the local memory administration CLI;
- `nuzo-mcp-server`, the stdio MCP server;
- `nuzo-memory-hook`, the bounded read-only lifecycle hook runner used by Codex
  and Claude Code integrations.

Nuzo stores memory locally, keeps inferred writes behind confirmation, and lets
Codex, Claude Code, CLI workflows, and generic MCP hosts use the same memory
contract.

## Install Once

```bash
npm install --global @nuzo/memory@1.0.0
nuzo setup
```

`nuzo setup` detects supported local hosts. When both Codex and Claude Code are
available, it lets you choose Codex, Claude Code, or both, then shows the
planned plugin changes and asks before changing host configuration. After
setup, open your host, confirm Nuzo is enabled, trust the two read-only recall
hooks, and start a new session.

For package upgrades, update the global package. Nuzo automatically refreshes
host plugins that were already installed through `nuzo setup`:

```bash
npm install --global @nuzo/memory@latest
```

If npm lifecycle scripts are disabled or the automatic refresh needs attention,
run `nuzo update --yes` as the recovery path.

## Manage Memory

```bash
nuzo memory init
nuzo memory doctor
nuzo memory manage
```

Store and recall safe test data:

```bash
nuzo memory remember "The demo project uses SQLite." --kind project_decision --tag demo
nuzo memory recall "demo storage"
```

## Verify Memory Across Sessions

In a new Codex or Claude Code session, say:

```text
Save this in Nuzo memory: My installation test marker is NUZO-OK.
```

Review and confirm the draft. Start another new session and ask:

```text
What is my Nuzo installation test marker?
```

The answer should use `NUZO-OK`.

## Safety Boundary

| Default | Meaning |
| --- | --- |
| Local SQLite storage | Memory stays under `~/.nuzo/memory/` unless configured otherwise. |
| Read-only recall hooks | Lifecycle hooks retrieve context but do not write memory. |
| Confirmed writes | Suggested memories remain drafts until the user confirms them. |
| No telemetry | Nuzo does not enable telemetry or remote embeddings by default. |

## Generic MCP Host

Configure this package as a stdio MCP server:

```bash
npm exec --yes --package=@nuzo/memory -- nuzo-mcp-server
```

## Included Binaries

| Binary | Purpose |
| --- | --- |
| `nuzo` | Inspect and administer local memory. |
| `nuzo-mcp-server` | Expose Nuzo memory tools over MCP stdio. |
| `nuzo-memory-hook` | Provide bounded read-only host recall hooks. |

## Runtime Configuration

The CLI, MCP server, and hook runner share these optional overrides:

| Variable | Purpose |
| --- | --- |
| `NUZO_MEMORY_STORE` | Select the SQLite store path. |
| `NUZO_MEMORY_SCOPE` | Select the default scope; `project:auto` resolves from the active project path. |
| `NUZO_PROJECT_ROOT` | Select the active project root; otherwise Nuzo discovers the nearest ancestor project config. |
| `NUZO_AUTHORIZATION_MODE` | Select `restricted` or `administrator` host authorization. |
| `NUZO_AUTHORIZED_SCOPES` | Restrict MCP/hook access to a comma-separated scope allowlist. |

Optional local hybrid retrieval is available through an explicitly installed
`@huggingface/transformers@4.2.0` peer and separately provisioned model. See
the [optional semantics guide](https://nuzo.com.br/operations/optional-semantics/).

Use `@nuzo/memory-core` only for library-level integrations.

Documentation: https://nuzo.com.br/

License: Apache-2.0
