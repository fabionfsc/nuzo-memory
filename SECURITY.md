# Security Policy

Nuzo is designed around local-first memory and explicit user control.

## Current Status

Nuzo `0.1.0` ships a local CLI, MCP server, SQLite runtime, and host plugin
artifacts. Security work covers runtime storage, input policy, dependency and
release integrity, host-tool boundaries, and safe repository practices.

## Security Principles

- No telemetry by default.
- No network calls by default.
- No remote embedding calls by default.
- No runtime memory committed to Git.
- No secrets in examples, fixtures, docs, or tests.
- Destructive memory operations must require explicit confirmation.
- Runtime files created by Nuzo must use owner-only permissions.
- Repository-controlled project config must not redirect storage outside the
  project `.nuzo` directory.

## Sensitive Data

Do not store or commit:

- API keys;
- OAuth tokens;
- passwords;
- private keys;
- cookies;
- database URLs with credentials;
- real user memory exports.

## Reporting

Open a private GitHub security advisory for this repository. Do not disclose
vulnerability details, proof-of-concept material, secrets, or affected user data
in a public Issue.

## Runtime Memory

Runtime memory should live outside Git:

```text
~/.nuzo/memory/
```

Project-level memory should be ignored:

```text
<project>/.nuzo/memory/
```

Scopes organize data but are not authorization boundaries in `0.1.x`. Use
separate stores when projects or hosts require isolation from each other.
