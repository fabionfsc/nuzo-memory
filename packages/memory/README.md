# @nuzo/memory

The official Nuzo package for local agent memory.

It installs the CLI, MCP server, and host lifecycle hook runner.

## Install

```bash
npm install --global @nuzo/memory
```

## Commands

```bash
nuzo memory doctor
nuzo memory remember "The project uses SQLite." --kind project_decision
nuzo memory recall "SQLite"
```

MCP hosts and generated host plugins use the same package:

```bash
npm exec --yes --package=@nuzo/memory -- nuzo-mcp-server
npm exec --yes --package=@nuzo/memory -- nuzo-memory-hook --doctor
```

## Includes

| Binary | Purpose |
| --- | --- |
| `nuzo` | Local memory control. |
| `nuzo-mcp-server` | MCP server for agent hosts. |
| `nuzo-memory-hook` | Read-only host recall hook. |

Runtime memory is stored locally under:

```text
~/.nuzo/memory/
```

No telemetry, sync, embeddings, or network calls are enabled by default.

## Library

Use `@nuzo/memory-core` only for library-level integrations.

Documentation: https://nuzo.com.br/

License: Apache-2.0
