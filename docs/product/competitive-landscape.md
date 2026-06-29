# Competitive Landscape

Nuzo should continue only if it stays focused.

The agent memory space is real, but it is not empty. Large AI vendors are adding native memory, and dedicated memory platforms already target agent workflows.

## Market Signals

- MCP is becoming a common integration layer for AI applications and agent tools.
- Codex supports MCP, plugins, and built-in memories.
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

## References

- [MCP introduction](https://modelcontextprotocol.io/docs/getting-started/intro)
- [Codex MCP](https://developers.openai.com/codex/mcp)
- [Codex plugins](https://developers.openai.com/codex/plugins)
- [Codex memories](https://developers.openai.com/codex/memories)
- [Claude Code plugins](https://code.claude.com/docs/en/plugins)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Mem0 Codex integration](https://docs.mem0.ai/integrations/codex)
- [Mem0 Claude Code integration](https://docs.mem0.ai/integrations/claude-code)
- [Zep overview](https://help.getzep.com/overview)
- [Letta Code memory](https://docs.letta.com/letta-code/memory)
