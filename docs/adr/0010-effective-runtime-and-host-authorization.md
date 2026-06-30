# ADR 0010: Effective Runtime And Host Authorization

- Status: Accepted
- Date: 2026-06-29

## Context

The CLI, direct MCP server, Codex plugin, Claude Code plugin, and lifecycle
hooks all need the same answer to four questions: which project is active,
which SQLite store is selected, which default scope applies, and which scopes
the process may access.

Resolving those answers independently creates dangerous drift. In particular,
a hook opened below the repository root can miss project config, and a
repository-controlled config must not be able to grant itself access to other
scopes in a shared user store.

## Decision

Core owns one effective runtime resolver. Interfaces provide their context and
consume its result instead of reconstructing configuration.

The resolver:

- canonicalizes an explicit project root or `NUZO_PROJECT_ROOT`;
- otherwise discovers the nearest ancestor `.nuzo/config.json` from the
  current working directory;
- applies store and scope precedence from explicit options, environment,
  project config, user config, and defaults;
- reads host authorization only from explicit options, environment, or trusted
  user config;
- rejects authorization fields in project config;
- resolves `project:auto` against the effective canonical project root;
- reports non-sensitive provenance and any safe adjustment.

The local CLI is an administrator interface. Published MCP and lifecycle-hook
entry points default to restricted mode with the active project scope and
`user:default`. Invalid restricted configuration and explicit scope conflicts
fail closed. A missing global authorization disables global recall rather than
bypassing the allowlist.

Host wrappers remain thin. Claude Code supplies its native project root when
available; Codex and generic paths use event working-directory discovery.

## Consequences

- Nested sessions share the root project's store and hashed scope.
- Project config can select project-local data but cannot expand host access.
- Doctor output can explain effective behavior without exposing config values
  or memory content.
- Embedders that need administrator behavior must request it explicitly.
- Separate stores and operating-system permissions remain necessary for
  process-level isolation; scopes are still selectors, not identities.

