# User Documentation Audit For 0.9.0

This audit records the installation-first review completed for the `0.9.0`
readiness cycle. User pages describe released or repository-controlled paths;
maintainer validation remains in Operations.

## Reviewed Entry Points

| Surface | Audience | Result |
| --- | --- | --- |
| Root README and docs homepage | First-time user | Lead with Codex, Claude Code, CLI, and generic MCP choices. |
| Getting Started and clean install | First-time user | Separate host-plugin installation from global CLI installation. |
| Agent memory loop | Routine user | Preserve the explicit draft, confirmation, and later-session recall flow. |
| Local CLI | CLI user | Install the public package before showing source-workspace commands. |
| Codex plugin | Codex user | Add exact marketplace, install, trust, verify, update, remove, and fallback steps. |
| Claude Code plugin | Claude Code user | Add exact marketplace, install, inspect, verify, update, disable, remove, and fallback steps. |
| MCP tool contract | Integrator | Keep the 14 public tools and read/write boundaries authoritative. |
| Lifecycle hooks | Advanced user | Keep host events, trust, fail-open behavior, and no-write guarantees explicit. |
| Optional semantics | Advanced user | Keep the feature optional and align installation with the current release. |
| Privacy and security | Every user | Keep local storage, scope, secret, permissions, and network defaults visible. |

## Verified Commands

The repository validation used isolated homes to verify:

- Codex marketplace add, discovery, installation, enabled state, and removal
  contract through `nuzo@nuzo-memory`;
- Claude Code marketplace validation, add, installation, enabled state, and
  plugin metadata through `nuzo@nuzo-memory`;
- generated host artifacts resolving the exact `@nuzo/memory` version;
- the NUZO-37 read-only continuity canary across fresh Codex and Claude Code
  hook invocations;
- strict MkDocs links and navigation.

The native marketplace proof runs in CI on Node.js 24. Node.js 22 continues to
validate package, manifest, generated artifact, and lifecycle contracts.

## Intentional Limits

- OpenAI-curated directory inclusion and Claude community marketplace review
  are external publication processes. The public repository marketplace is the
  supported path controlled by Nuzo.
- Automated hooks prove delivery of bounded memory context, not that every
  model response will obey stored content. Memory remains untrusted data.
- The first plugin use may access npm to install the exact pinned runtime.
  Subsequent runtime behavior remains local-first by default.
