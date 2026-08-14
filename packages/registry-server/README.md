# Nuzo Memory MCP Server

> Nuzo `1.2.0` is the final planned release. This MCP Registry distribution
> remains available, but no ongoing fixes, security response, or compatibility
> updates are promised. See the repository's end-of-maintenance notice.

`@nuzo/memory-mcp` is the single-entrypoint npm distribution for publishing
Nuzo to the official MCP Registry.

Most users should install the unified package instead:

```bash
npm install --global @nuzo/memory
nuzo setup
```

MCP clients and registry integrations can run this package directly:

```bash
npx --yes @nuzo/memory-mcp@1.1.0
```

The server uses stdio, stores memory locally, performs no telemetry, and makes
no network calls by default. Writes remain explicit and auditable. Configure
the store or scope with the same `NUZO_MEMORY_*` environment variables as the
unified runtime.

This package contains no separate memory behavior. Its runtime is built from
the shared `packages/mcp-server` source and calls `@nuzo/memory-core` use cases.

Documentation: https://nuzo.com.br/

Repository: https://github.com/fabionfsc/nuzo-memory

MCP Registry name: `io.github.fabionfsc/nuzo-memory`
