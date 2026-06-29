# @nuzo/memory-core

The host-neutral memory engine for Nuzo.

This package contains memory lifecycle behavior, policy checks, SQLite storage,
FTS recall, audit events, and portable import/export contracts. It is consumed
by `@nuzo/memory`.

SQLite FTS is the default retrieval path. The optional semantic contracts are
inert unless a library caller supplies a provider, builds a derived sidecar,
and explicitly requests semantic or hybrid retrieval. Canonical writes never
invoke an embedding provider.

The benchmark-proven local provider uses an optional peer dependency so normal
installs do not include an inference runtime or model:

```bash
npm install @nuzo/memory-core@0.7.0 @huggingface/transformers@4.2.0
```

Model provisioning is a separate explicit operation. Provider creation and
normal recall only accept the pinned, checksum-verified local model files and
disable remote model loading.

Most users should install the CLI or a host plugin instead of depending on the
core package directly.

## Use When

Use `@nuzo/memory-core` when you are:

- building a library-level integration with Nuzo;
- contributing to Nuzo itself;
- writing a host wrapper that cannot use the MCP server directly.

Use `@nuzo/memory` for local command-line workflows, Codex, Claude Code, and
other MCP-compatible hosts.

## Product Boundary

Nuzo is intentionally local-first. SQLite is part of the product boundary, not
a placeholder for a required cloud database.

By default, Nuzo should not:

- send memories to a remote service;
- call embedding APIs;
- enable telemetry;
- hide inferred memory writes from the user.

Documentation: https://nuzo.com.br/

License: Apache-2.0
