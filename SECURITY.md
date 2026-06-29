# Security Policy

Nuzo is designed around local-first memory and explicit user control.

## Current Status

The current public release ships a local CLI, MCP server, SQLite runtime, host
plugin artifacts, restricted scope policy, and optional local semantic
retrieval.
Security work covers runtime storage, input policy, dependency and release
integrity, host-tool boundaries, derived semantic data, and safe repository
practices.

## Security Principles

- No telemetry by default.
- No network calls by default.
- No remote embedding calls by default.
- No runtime memory committed to Git.
- No real secrets in documentation, fixtures, or tests. Credential-shaped
  scanner fixtures must be synthetic and clearly confined to tests.
- Destructive memory operations must require explicit confirmation.
- Runtime files created by Nuzo must use owner-only permissions.
- Repository-controlled project config must not redirect storage outside the
  project `.nuzo` directory.

## Repository Controls

The public repository should keep these controls enabled:

- GitHub secret scanning and push protection.
- Dependabot alerts and security updates.
- CodeQL analysis for JavaScript and TypeScript.
- Branch protection or repository rules that prevent force pushes and require
  the release validation checks before untrusted changes merge.

Maintainer bypass rules, if any, must be intentional and documented in the
release checklist. Do not weaken repository controls to speed up a release.

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

Scopes are selectors, not security principals. Restricted core and MCP
sessions enforce explicit scope allowlists, while the local CLI and
unrestricted core remain administrator workflows over the selected store.
Use separate stores and operating-system controls when projects, hosts, users,
or trust levels require process-level isolation from each other.
