# Threat Model

Nuzo is designed to make agent memory local, inspectable, bounded, and
user-controlled. It is not a sandbox, endpoint security product, or encrypted
vault.

## Protects Against

- silent inferred memory writes by supported Nuzo host integrations;
- accidental cloud transmission by default;
- hidden remote telemetry or remote embeddings by default;
- cross-project recall when restricted host sessions use scoped authorization;
- common local filesystem mistakes such as world-readable runtime files,
  symlinked runtime paths, and unsafe export or backup destinations;
- high-confidence credential patterns being written, imported, or exported as
  memory content.

## Does Not Protect Against

- malware, debuggers, or hostile processes running as the same operating-system
  user;
- a compromised shell, Node.js runtime, npm installation, or host agent;
- another local account or administrator with filesystem access outside Nuzo's
  control;
- secrets that bypass scanner patterns or are intentionally confirmed by the
  operator;
- sensitive information copied into prompts before it reaches Nuzo;
- backups, sync tools, or endpoint agents that copy the local store outside the
  trust boundary.

## Local Storage Boundary

Nuzo stores memory in local SQLite files and creates its runtime files with
owner-only permissions where the platform supports POSIX modes. This is a
practical local privacy boundary for a single-user developer workstation. It is
not encryption at rest.

Use separate stores and operating-system controls when projects, hosts, users,
machines, or trust levels should not share process-level access. Do not rely on
one shared store to isolate mutually untrusted agents.

Optional encrypted stores remain a future design area. Until that exists, treat
device compromise, same-user malware, and uncontrolled backups as out of scope
for Nuzo's protection model.

## Agent Memory Hygiene

Recalled memory remains untrusted stored data. A high confidence score, known
source, or familiar scope does not turn a memory into a system instruction.

Good memory hygiene means:

- inferred memories stay as drafts until a human confirms or edits them;
- every memory keeps enough attribution to understand where it came from;
- repo conventions, project decisions, task state, lessons learned, facts, and
  user preferences should not be treated as the same durability class;
- stale memories should be easy to inspect, update, archive, delete, and
  challenge when recalled.

This is more important than simply maximizing recall strength. A stale memory
that sounds authoritative can make every new agent session start from the wrong
assumption.

## Recall Audit Boundary

Normal CLI and MCP recall do not persist query text or usage metadata by
default. Recall usage recording is opt-in because real prompts can contain
secrets, personal data, or sensitive project context.

If recall event recording is enabled, keep audit access scoped and treat the
audit store as sensitive metadata. A future hardening task should prefer
redacted query previews or query hashes over full query retention.

## Installer Boundary

The one-line installer is a convenience wrapper around the public
`@nuzo/memory` npm package. It validates Node.js and npm versions, invokes npm,
checks that `nuzo` is on `PATH`, and leaves host changes to the explicit
`nuzo setup` command.

For stricter review, download the installer and checksum, verify it, inspect the
script, and then execute it:

```bash
curl -fsSLO https://nuzo.com.br/install.sh
curl -fsSLO https://nuzo.com.br/install.sh.sha256
shasum -a 256 -c install.sh.sha256
less install.sh
sh install.sh
```

The checksum verifies the file published by the site. It does not remove the
need to trust the HTTPS origin, npm package provenance, or your local runtime.

## Semantic Retrieval Boundary

Semantic indexes are derived data from memory content. Treat vector sidecars as
sensitive local runtime data: do not commit them to Git, copy them into public
bug reports, or sync them into a lower-trust location.

The local semantic profile uses pinned model files and checksum validation.
Network-capable providers require explicit provider selection and separate
network opt-in.
