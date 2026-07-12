# Why Nuzo?

Nuzo is for developers who want useful cross-session agent memory without
handing ownership of that memory to one host or an opaque service.

The shortest description is:

> Nuzo is a local, inspectable memory ledger for coding agents.

It stores confirmed memories in SQLite, recalls a bounded subset through CLI
or MCP, and keeps every inferred write behind an explicit user decision. You
can inspect, challenge, update, export, archive, or delete what was remembered.

## The Problem It Solves

Coding agents routinely rediscover the same project decisions, preferences,
and failure lessons. Pasting all of that context into every prompt is noisy,
while allowing a host to infer and retain it invisibly creates a trust problem.

Nuzo separates the loop into two different authorities:

- recall may happen automatically, locally, and read-only;
- capture remains a visible draft until the user confirms, edits, or rejects it.

Recalled memory is framed as untrusted stored data. It does not outrank the
user, repository instructions, or the current task.

## Why Not Just `AGENTS.md`?

Use `AGENTS.md` for durable repository instructions: build commands, coding
conventions, verification rules, and expectations that should apply to anyone
working in the repository. Commit those rules and review them like code.

Use Nuzo for user- or project-scoped knowledge that needs a lifecycle: a
preference, a decision with provenance, a lesson that may become stale, or
context that should work across multiple supported hosts without becoming a
repository instruction.

| Question | `AGENTS.md` | Nuzo |
| --- | --- | --- |
| Should every contributor follow it? | Usually yes. | Not necessarily. |
| Should it be reviewed in Git? | Yes. | Runtime stores stay out of Git. |
| Does it need recall ranking? | No; it is loaded as instruction context. | Yes; recall is scoped and bounded. |
| Can it be challenged or superseded? | Through a file change. | Through memory lifecycle and relation records. |
| Does it carry per-record provenance and audit history? | Not by default. | Yes. |

The two surfaces complement each other. Do not copy repository policy into
Nuzo merely to avoid maintaining `AGENTS.md`.

## Why Not Just `MEMORY.md`?

A hand-maintained Markdown file is a strong small-system option. Choose it when
the dataset is short, one host or workflow owns it, and ordinary Git or file
history provides enough governance.

Choose Nuzo when you need record-level scope, structured provenance, review
dates, relations, audit events, bounded retrieval, JSON portability, or the
same contract across CLI and MCP hosts. Nuzo can export reviewable Markdown,
but its canonical store remains structured so lifecycle operations do not
depend on rewriting an unbounded document.

## Why Not Native Assistant Memory?

Native memory is often the most convenient choice inside one product. Nuzo is
useful when the memory must stay on the user's machine by default, be directly
inspectable, or move across Nuzo-enabled hosts.

Nuzo does not claim to read, replace, or convert a host's private memory store.
Use both when that division is useful: native memory for host convenience and
Nuzo for user-owned, auditable project knowledge.

## When Nuzo Is The Wrong Choice

Do not add Nuzo when:

- a short committed instruction file already solves the problem;
- you need a managed enterprise knowledge graph or multi-tenant cloud service;
- you want silent transcript ingestion and automatic agent-written memory;
- the workflow cannot run Node.js 22 or 24 and a local SQLite native module;
- memory must be shared remotely in real time without an external sync design.

Those are different product requirements, not missing setup flags.

## Prove The Boundary

Run the [60-second CLI demo](../getting-started/sixty-second-demo.md) to create a
temporary store, recall one fake decision, inspect its metadata, and delete the
entire demo without touching your normal Nuzo data.
