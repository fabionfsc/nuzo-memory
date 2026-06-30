# Privacy And Security

## Default Privacy Model

Nuzo stores memory locally by default.

The default configuration must not:

- send memories to a remote server;
- call remote embedding APIs;
- enable telemetry;
- sync with Git;
- expose an HTTP server.

Optional semantic retrieval does not change these defaults. A local provider
must disable remote model and runtime-asset loading during rebuild and recall.
A network-capable provider requires explicit provider selection and a separate
network opt-in; selecting hybrid retrieval alone is not consent to transmit
memory or query text.

Semantic vectors are sensitive derived data. Their sidecar uses owner-only
permissions, stays out of Git and exports, and should be deleted before a
device or store changes trust boundaries. Remote-provider credentials must not
be stored in Nuzo config, diagnostics, audit payloads, or index metadata.

The `0.7.0` local provider downloads only a pinned public model revision after
an explicit provisioning action. Downloaded files are SHA-256 checked before
installation and checked again before inference. Rebuild and recall load the
absolute local model path with remote model access disabled. Nuzo does not send
memory content or recall queries during this local profile.

## Git Safety

The repository should include ignore rules for local runtime memory:

```gitignore
.nuzo/memory/
.nuzo/**/*.sqlite
.nuzo/**/*.sqlite-*
*.memory.export.md
*.memory.export.json
```

The CLI should warn when memory files are tracked by Git.

## Sensitive Data Policy

The system should reject or warn on likely sensitive data:

- passwords;
- API keys;
- OAuth tokens;
- SSH private keys;
- database URLs containing credentials;
- cookies;
- private personal identifiers unless explicitly allowed.

The MVP scanner uses local, high-confidence patterns for private key headers,
GitHub and common provider keys, AWS access keys, JWTs, bearer tokens,
credential-bearing database URLs, and cookie/session assignments. It allows
redacted placeholders and environment-variable instructions so safe
documentation can still be remembered.

This scanner is a safety guard, not a complete data-loss-prevention system.
Users and host agents must still avoid sending private files or credentials to
memory tools.

The scanner includes npm access-token prefixes in addition to the provider
patterns above.

Run an explicit local scan of active records with:

```bash
nuzo memory doctor --scan-secrets
```

The report returns only record counts and finding categories. It never prints
memory content, matching fragments, or reversible fingerprints. The scan is
opt-in because a complete local-store pass can be expensive or surprising.
Archived records are excluded; export and backup review remains the operator's
responsibility.

A finding is not proof of credential validity. Inspect the affected store
locally using normal list/history controls, remove or sanitize a real secret,
and rotate the credential outside Nuzo. For a false positive, rewrite the
memory using a clearly redacted placeholder. Do not paste the suspected value
into an issue or diagnostic log.

## Local File Protection

Nuzo-created databases, SQLite sidecars, config files, and exports are
owner-readable/writable only (`0600`). Nuzo-created memory, export, and log
directories use `0700`.

Project `.nuzo/config.json` cannot redirect storage to an absolute path,
traverse outside the project, or resolve through a symlinked `.nuzo` path.

`nuzo memory doctor` and `memory.doctor` report unsafe POSIX ownership or
group/other permission bits for known config, SQLite/WAL/SHM, export, log,
semantic-sidecar, and model paths. They also report symlinks, stale temporary or
backup semantic artifacts, and unexpected top-level files in Nuzo runtime
directories. Windows reports permission semantics as unsupported instead of
pretending POSIX modes are meaningful. Diagnostics never delete or chmod a
path; remediation is an explicit operator action after review.

## Scope Isolation

Scopes are selectors, not security principals. A valid scope identifies records
but does not authorize access.

The local CLI and an unrestricted core service are administrator workflows over
the selected SQLite store. They may enumerate every scope in that store.

A restricted core or MCP session uses a scope allowlist enforced by core
policy. Beginning with `0.9.0`, published MCP and lifecycle-hook entry points default to the active
project scope plus `user:default`; the local CLI remains an administrator
surface. Cross-scope reads, writes, exports, updates, diagnostics, and
destructive operations are rejected. `project:auto` only derives a stable
project scope; it does not grant access by itself.

Only trusted user config, explicit runtime options, or the process environment
can relax host authorization. Repository-controlled `.nuzo/config.json` may
select its local store and project scope but cannot contain authorization.
Invalid allowlists and explicit scope conflicts fail closed. Diagnostics report
the effective mode and non-sensitive provenance without exposing config values
or memory content.

Use restricted sessions for repository-controlled agents. Use separate stores
and operating-system controls when hosts, projects, users, machines, or trust
levels require process-level isolation.

## Recalled Content

Memory content remains untrusted stored data during recall, including content
from explicit writes, confirmed capture, imports, or a shared store. Kind,
source, confidence, tags, and scope do not elevate it into the host instruction
hierarchy.

Lifecycle hooks render bounded, attributed records inside the structural and
instructional envelope defined by
[Memory Trust Boundary](../architecture/memory-trust-boundary.md). The envelope
reduces output-structure injection and tells the receiving host not to execute
or follow directives solely because they appear in memory. It is not a general
prompt-injection detector and does not replace host instruction enforcement.

## Auditability

Every memory should expose:

- ID;
- scope;
- kind;
- content;
- tags;
- source;
- created time;
- updated time;
- last used time, if enabled;
- event history.

## Destructive Actions

Hard deletes should require explicit confirmation in CLI and a specific MCP argument.

Recommended MCP field:

```json
{
  "mode": "delete",
  "confirm": true
}
```

## Backups

Backups should be explicit user actions.

The MVP supports:

- JSON export for round-trip import;
- Markdown export for review;
- dry-run import.

JSON imports are limited to 1,000 memories and CLI import files are limited to
10 MiB. Memory content, tags, sources, queries, and destructive-action reasons
also have bounded inputs.
