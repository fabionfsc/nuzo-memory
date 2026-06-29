# Agent Memory Loop

This walkthrough shows the core Nuzo loop:

```text
session A confirms a memory
  -> Nuzo stores it locally
session B starts later
  -> Nuzo injects bounded read-only bootstrap memory
first relevant prompt is submitted
  -> Nuzo recalls matching content and topical tags
user reviews or changes memory
  -> Nuzo records an auditable update or forget event
```

Use fake data when testing. Do not use real secrets, private customer data,
tokens, raw logs, or private file contents.

## Choose An Interface

Use the [Getting Started](index.md) host instructions for Codex or Claude Code;
their plugins provide this flow without a separate global install. The commands
below demonstrate the same lifecycle directly through the CLI:

```bash
npm install --global @nuzo/memory
```

Initialize the local store when you want to manage memory directly:

```bash
nuzo memory init
```

The default local store is:

```text
~/.nuzo/memory/memories.sqlite
```

## Session A: Confirm A Memory

Use an explicit memory command when the user wants something to persist:

```bash
nuzo memory suggest-capture \
  "The demo project prefers concise status updates during long-running work." \
  --kind preference \
  --tag demo \
  --tag workflow \
  --source codex:capture-suggestion \
  --confidence 0.8 \
  --reason "The user stated a durable workflow preference."
```

`suggest-capture` validates and normalizes the draft, but it does not write
memory.

After the user confirms the draft, apply the explicit decision:

```bash
nuzo memory confirm-capture \
  "The demo project prefers concise status updates during long-running work." \
  --decision create \
  --kind preference \
  --tag demo \
  --tag workflow \
  --source codex:capture-confirmed \
  --reason "The user confirmed the draft." \
  --yes
```

The command prints a memory ID such as:

```text
mem_01HZY...
```

## Session B: Recall Later

In a later session, recall by task context:

```bash
nuzo memory recall "How should the agent report long-running work?"
```

The same behavior is available to MCP hosts through `memory.recall_hook`.
Codex and Claude Code plugins also bundle automatic read-only lifecycle hooks:

- add `autoload` to a confirmed memory only when it should apply at every
  session start in its scope;
- use topical tags such as `cloudflare`, `docker`, or `workflow` for contextual
  recall when a submitted prompt matches them.

Neither recall path creates capture suggestions or writes memory.

## Direct Codex Flow

When a Codex user says:

```text
Save this in Nuzo memory: I prefer concise status updates during long-running work.
```

The Nuzo Codex skill should guide the agent through this sequence:

```text
memory.suggest_capture
  -> show the validated draft, duplicate, or relationship evidence
  -> user chooses create, update, keep separate, clarify, or reject
  -> memory.confirm_capture applies the explicit decision
```

If the user rejects the draft, Nuzo should write nothing. If the draft is an
exact duplicate, the agent should show the existing memory instead of creating a
new one by default.

## Update A Memory

When a later statement changes an existing memory, prefer an update over a
duplicate.

First list the current memory and revision:

```bash
nuzo memory list --tag demo
```

Then update with the revision the user reviewed:

```bash
nuzo memory update mem_01HZY \
  --expected-revision 1 \
  --content "The demo project prefers concise status updates with explicit blockers during long-running work."
```

If another process changed the memory first, Nuzo returns
`MEMORY_REVISION_CONFLICT`. Re-read the memory and ask the user to confirm the
new update. Do not retry silently.

## Review And Audit

List active memories:

```bash
nuzo memory list
```

Show audit history:

```bash
nuzo memory history mem_01HZY
```

Archive a memory:

```bash
nuzo memory forget mem_01HZY --expected-revision 2 --archive
```

Export for review or portability:

```bash
nuzo memory export --path ./demo.memory.export.json
```

Preview import before writing:

```bash
nuzo memory import ./demo.memory.export.json --dry-run
```

## Safe Dogfooding Examples

These fake examples are safe for repository docs and tests:

| Situation | Memory |
| --- | --- |
| Project workflow | "Nuzo uses GitHub Issues as the execution tracker for scoped work." |
| Architecture rule | "Nuzo keeps memory business logic in `packages/core`." |
| Documentation rule | "Nuzo public docs and examples are written in English." |
| Release workflow | "Nuzo release docs must keep public version references aligned." |

Do not dogfood with private operator notes, real memory exports, credentials,
customer data, unpublished security findings, or machine-local workflow details.

## Validation

Repository smokes validate the same lifecycle with fake memory:

```bash
npm run smoke:codex-plugin
npm run smoke:host-hooks
npm run smoke:published:mcp
```

Those smokes verify separate-session recall, read-only capture suggestions,
rejected drafts, confirmed writes, duplicate handling, update conflicts, and
doctor output without exposing memory content.
