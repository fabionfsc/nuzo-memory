# @nuzo/mcp-server

The MCP stdio server for Nuzo, a local-first and auditable memory layer for AI
agents.

Use this package when an MCP-compatible host needs access to Nuzo memory tools.
Human users usually install `@nuzo/memory-cli` instead.

## Run

For direct MCP host configuration:

```bash
npm exec --yes --package=@nuzo/mcp-server -- nuzo-mcp-server
```

Generated host plugin artifacts pin the matching `@nuzo/mcp-server` version
for reproducible installs. Direct npm examples omit a release number so normal
users get the current package.

## Tools

The server exposes the Nuzo memory contract over MCP:

```text
memory.remember
memory.recall
memory.recall_hook
memory.suggest_capture
memory.list
memory.update
memory.history
memory.forget
memory.forget_many
memory.export
memory.import
memory.doctor
```

`memory.suggest_capture` is read-only. Use it to validate inferred memory
drafts before asking the user to confirm a write through `memory.remember`.

## Defaults

Runtime memory is stored locally under:

```text
~/.nuzo/memory/
```

Nuzo does not enable telemetry, sync, embeddings, or network calls by default.

Documentation: https://nuzo.com.br/

License: Apache-2.0
