# @nuzo/memory

The official Nuzo package for local agent memory.

It installs the CLI, MCP server, and host lifecycle hook runner.

## Install

```bash
npm install --global @nuzo/memory
```

## Agent Plugins

The npm package is the runtime. Codex, Claude Code, and other MCP hosts still
need Nuzo configured as a plugin or MCP server.

```bash
npm exec --yes --package=@nuzo/memory -- nuzo-mcp-server
```

Generated Nuzo plugins also use:

```bash
npm exec --yes --package=@nuzo/memory -- nuzo-memory-hook --doctor
```

## Manage Memory

Use the CLI to inspect and maintain local memory:

```bash
nuzo memory init
nuzo memory doctor
nuzo memory list
nuzo memory recall "deployment preferences"
```

## Binaries

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

Optional local hybrid retrieval is available without changing that default.
Install `@huggingface/transformers@4.2.0` alongside Nuzo, explicitly provision
the pinned model, and rebuild the disposable semantic sidecar. See
https://nuzo.com.br/operations/optional-semantics/.

## Library

Use `@nuzo/memory-core` only for library-level integrations.

Documentation: https://nuzo.com.br/

License: Apache-2.0
