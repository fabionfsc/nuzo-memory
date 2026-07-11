# Competitive Landscape

Last reviewed: 2026-07-11. Product capabilities change; follow the linked
official documentation before making an integration decision.

Nuzo should continue only if it stays focused.

The agent memory space is real, but it is not empty. Large AI vendors are adding native memory, and dedicated memory platforms already target agent workflows.

## Choose By Operating Model

These products overlap around durable agent context, but they optimize for
different operating models. The table describes documented defaults and core
abstractions, not every deployment option.

| Option | Best fit | Default memory shape | Infrastructure boundary | Main tradeoff relative to Nuzo |
| --- | --- | --- | --- | --- |
| `AGENTS.md` or `MEMORY.md` | Small, durable instructions or manually curated notes. | One or more files. | Repository or local filesystem. | Simple and reviewable, but no record-level retrieval, provenance, audit, or lifecycle contract. |
| Native host memory | Convenience inside one assistant product. | Host-defined. | Host/account-defined. | Lowest integration friction, but portability and inspection follow the host's public surface. |
| Nuzo | Local coding-agent memory that needs explicit writes, audit, and cross-host MCP access. | Scoped records in local SQLite; optional derived local semantic index. | User's machine by default. | Deliberately avoids managed sync, multi-tenant service operation, and silent ingestion. |
| Mem0 Codex/Claude integrations | Cloud-backed memory with direct hosted MCP and agent workflow integrations. | Platform-managed memories and search. | Mem0 account, API key, and hosted MCP in its documented Codex path. | Broader managed platform convenience; Nuzo instead defaults to no account, API key, or network. |
| Zep | Application and enterprise context built from users, threads, business data, and temporal facts. | Temporal context/knowledge graphs with facts, entities, episodes, summaries, and observations. | Managed Context Lake and SDK/API integration; Graphiti is the related open-source graph framework. | Much broader temporal graph and application context system; Nuzo is a smaller local coding-agent layer. |
| Letta | Memory-first agents whose persistent context is part of the agent architecture. | Always-visible memory blocks plus other context tiers. | Letta agent runtime/API; blocks are agent-managed and read-write by default, with read-only support. | Stronger agent-owned memory model; Nuzo keeps inferred capture behind user confirmation by default. |

This is not a universal ranking. If a team needs managed multi-user context,
automatic conversation ingestion, or temporal graph extraction, Nuzo is
probably the smaller and less suitable system. If the requirement is a local,
inspectable ledger for coding agents, the smaller boundary is the point.

## Market Signals

- MCP is becoming a common integration layer for AI applications and agent tools.
- Codex exposes durable repository guidance, plugins, hooks, and MCP extension
  surfaces; those have different scopes from a record-level memory store.
- Claude Code supports MCP, plugins, skills, hooks, and plugin-provided MCP servers.
- Mem0 already provides memory plugins for Codex and Claude Code.
- Zep, Letta, LangGraph, and related projects show that agent memory is an active product and research category.

## Main Competitor Pattern

The strongest competing pattern is:

```text
cloud memory platform
  -> MCP endpoint
  -> host plugin
  -> lifecycle hooks
  -> semantic search / graph retrieval
```

Mem0 is the clearest example for Nuzo because it already documents Codex and Claude Code integrations.

Zep is stronger around enterprise memory, temporal knowledge graphs, and governed context.

Letta is stronger around memory-first agents, git-backed memory files, and agent-owned memory editing.

## Nuzo Differentiation

Nuzo should not try to become a cloud memory platform first.

The defensible wedge is:

```text
local-first, inspectable memory for agent CLIs
```

Nuzo should prioritize:

- local SQLite storage by default;
- no API key or cloud account required;
- explicit CLI control;
- documented JSON export/import;
- Markdown review exports;
- audit events;
- Git-safe runtime defaults;
- one MCP contract across Codex, Claude Code, and future hosts.

SQLite and local FTS are not accidental limitations. They are the default
implementation of the product promise: memory stays local, inspectable,
portable, and usable without an account, network call, telemetry stream, or
embedding provider.

## Strategic Position

Nuzo is not a replacement for native assistant memory or cloud memory platforms.

It is the user-owned memory layer for cases where the user wants:

- control over where memory lives;
- visibility into what was remembered;
- portability between host tools;
- a stable local store outside one vendor account;
- a small MCP-native component that can be audited and extended.

## Risks

| Risk | Impact | Response |
| --- | --- | --- |
| Native host memory improves quickly. | Convenience use cases may disappear. | Stay complementary and focus on portability/control. |
| Mem0 owns the plugin UX first. | Nuzo may look less capable. | Differentiate on local-first, no cloud dependency, and transparent storage. |
| Semantic memory becomes table stakes. | Optional inference may add resource and portability costs. | Keep FTS as the default and expand local semantic retrieval only behind benchmark and resource gates. |
| Plugin APIs shift. | Host packages can break. | Keep host packages thin and MCP/core stable. |
| Import/export duplicates or corrupts state. | Portability claim weakens. | Keep import idempotent and versioned. |

## Product Rule

Do not chase every memory platform feature.

Nuzo should ship a tight local workflow first:

1. Save a memory explicitly.
2. Recall it through MCP.
3. List, edit, forget, export, and import it.
4. Use the same store from Codex and Claude Code.
5. Keep everything inspectable and Git-safe.

Only expand semantic ranking, graph memory, sync, or lifecycle automation when
they preserve this rule. The optional local semantic path must remain derived,
explicit, and removable without affecting canonical memory.

## Do Not Do Yet

Avoid attractive features that would dilute the current wedge before Nuzo is
easy to install and prove in real agent workflows:

- cloud sync;
- multi-tenant SaaS hosting;
- heavyweight graph memory;
- remote embeddings by default;
- LLM-based automatic compression without confirmation;
- silent capture of inferred memories;
- host-specific memory formats that bypass MCP/core.

## Source Discipline

Comparison claims should cite first-party product documentation and carry a
review date. Avoid inferred claims about private storage, security posture,
pricing, scale, or host endorsement. “Local-first” describes Nuzo's default
data path; it is not a blanket security guarantee.

## Official References

- [MCP introduction](https://modelcontextprotocol.io/docs/getting-started/intro)
- [Codex MCP](https://developers.openai.com/codex/mcp)
- [Codex plugins](https://developers.openai.com/codex/plugins)
- [Codex customization](https://developers.openai.com/codex/concepts/customization)
- [Claude Code plugins](https://code.claude.com/docs/en/plugins)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Mem0 Codex integration](https://docs.mem0.ai/integrations/codex)
- [Mem0 Claude Code integration](https://docs.mem0.ai/integrations/claude-code)
- [Zep key concepts](https://help.getzep.com/concepts)
- [Zep and Graphiti](https://help.getzep.com/zep-vs-graphiti)
- [Letta memory blocks](https://docs.letta.com/guides/core-concepts/memory/memory-blocks)
