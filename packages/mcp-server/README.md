# @nuzo/mcp-server

The MCP stdio server for Nuzo, a local-first and auditable memory layer for AI
agents.

The server exposes Nuzo memory tools and stores memory locally under
`~/.nuzo/memory/` by default.

Its read-only tools include recall, listing, audit history, export, and doctor
diagnostics.

Run a published version with:

```bash
npm exec --yes --package=@nuzo/mcp-server@<version> -- nuzo-mcp-server
```

Use a fixed version in host plugins and automated configuration. Do not depend
on `latest` for reproducible installs.

Documentation: https://nuzo.com.br/

License: Apache-2.0
