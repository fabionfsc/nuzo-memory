# Security Policy

Nuzo is designed around local-first memory and explicit user control.

## Current Status

The project is in the design stage and does not yet ship runtime code. Security work currently focuses on storage design, privacy defaults, threat modeling, and safe repository practices.

## Security Principles

- No telemetry by default.
- No network calls by default.
- No remote embedding calls by default.
- No runtime memory committed to Git.
- No secrets in examples, fixtures, docs, or tests.
- Destructive memory operations must require explicit confirmation.

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

Until a dedicated security contact is configured, open a private GitHub security advisory if available for the repository. If that is not available, open a minimal public issue without including secrets or exploit details.

## Runtime Memory

Runtime memory should live outside Git:

```text
~/.nuzo/memory/
```

Project-level memory should be ignored:

```text
<project>/.nuzo/memory/
```
