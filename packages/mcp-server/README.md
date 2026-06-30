# @nuzo/mcp-server

Legacy transition Nuzo MCP server package.

Use the unified package instead:

```bash
npm exec --yes --package=@nuzo/memory -- nuzo-mcp-server
```

Generated host plugin artifacts pin `@nuzo/memory` for reproducible installs.

```bash
npm exec --yes --package=@nuzo/memory -- nuzo-memory-hook --doctor
```

The MCP server and hook runner honor the shared Nuzo runtime environment:
`NUZO_MEMORY_STORE`, `NUZO_MEMORY_SCOPE`, and `NUZO_AUTHORIZED_SCOPES`.

Documentation: https://nuzo.com.br/

This package remains published during the transition window for existing users
and automation. New installs should use `@nuzo/memory`.
Version `0.9.0` is the planned final release of this transition package. After
`0.9.0` is published, all of its npm versions will be marked deprecated with
migration guidance to `@nuzo/memory`.

License: Apache-2.0
