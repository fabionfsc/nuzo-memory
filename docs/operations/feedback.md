# Feedback And Support

Nuzo does not accept new feedback or support requests after the final `1.2.0`
release and repository archival. The links below are retained as historical
workflow documentation and may be unavailable in the archived repository.
Nuzo does not collect product telemetry.

Choose the narrowest form:

- [Installation Feedback](https://github.com/fabionfsc/nuzo-memory/issues/new?template=installation-feedback.yml)
  for clean-install success or friction;
- [Bug](https://github.com/fabionfsc/nuzo-memory/issues/new?template=bug.yml)
  for reproducible incorrect behavior;
- [Feature](https://github.com/fabionfsc/nuzo-memory/issues/new?template=feature.yml)
  for a scoped product outcome;
- [Documentation](https://github.com/fabionfsc/nuzo-memory/issues/new?template=docs.yml)
  for unclear or stale guidance;
- [Architecture Proposal](https://github.com/fabionfsc/nuzo-memory/issues/new?template=architecture.yml)
  for substantial, cross-boundary, or hard-to-reverse changes;
- [Security policy](https://github.com/fabionfsc/nuzo-memory/security/policy)
  for vulnerability reporting instructions.

## Safe Diagnostic Information

Useful reports include:

- operating system and architecture;
- `node --version`, `npm --version`, and `nuzo --version`;
- the host name and whether setup, hooks, or MCP discovery failed;
- the exact command and sanitized error text;
- whether a disposable fake-data store reproduces the issue.

Do not attach a SQLite store, real memory export, credentials, tokens, private
host configuration, home-directory paths, or personal conversation content.
Run diagnostics locally and include only the minimum sanitized fields needed
to reproduce the problem. Do not paste a normal doctor report wholesale,
because local paths can be useful to the operator while remaining unsuitable
for a public issue.
