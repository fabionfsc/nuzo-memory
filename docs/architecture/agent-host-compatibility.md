# Agent Host Compatibility

Nuzo should stay host-neutral.

The product is a local-first memory layer for AI agents. Codex and Claude Code are the first priority hosts because they are strong CLI-based agent environments and both support MCP-based extension paths.

## Design Position

Nuzo should not depend on one agent runtime.

```text
Nuzo core
  -> CLI for direct user control
  -> MCP server as the universal agent contract
  -> host packages for Codex, Claude Code, and future agent CLIs
```

Host packages may differ, but they must call the same MCP tools and core use cases.

When a host can identify a project, workspace, or profile boundary, its Nuzo
MCP configuration should prefer an explicit authorized scope set. A shared
administrator store remains possible for local CLI workflows, but
repository-controlled agents should not receive unscoped access to unrelated
memory by default.

## Compatibility Principle

MCP is the stable center.

Every host integration should be judged by whether it can expose the existing Nuzo MCP server without changing memory behavior.

The public memory contract remains:

- `memory.remember`
- `memory.recall`
- `memory.recall_hook`
- `memory.list`
- `memory.update`
- `memory.history`
- `memory.forget`
- `memory.forget_many`
- `memory.export`
- `memory.import`
- `memory.doctor`

Host-specific plugin systems are distribution wrappers, not memory engines.

## Portable Memory Flow

Nuzo export/import belongs to Nuzo, not to a specific host.

Host plugins make the Nuzo tools available inside Codex, Claude Code, or another agent environment. The data format stays the Nuzo export format.

```text
Codex + Nuzo plugin
  -> memory.export
  -> nuzo-memory-export JSON
  -> memory.import
  -> Claude Code + Nuzo plugin
```

The reverse flow should work the same way:

```text
Claude Code + Nuzo plugin
  -> memory.export
  -> nuzo-memory-export JSON
  -> memory.import
  -> Codex + Nuzo plugin
```

When both hosts run on the same machine and point to the same store, export/import may not be needed. Both hosts can use the same Nuzo MCP server and local store directly:

```text
Codex        \
              -> Nuzo MCP server -> ~/.nuzo/memory/memories.sqlite
Claude Code  /
```

For different machines, profiles, workspaces, or isolated stores, JSON export/import is the portability path.

Nuzo should not promise migration from private native memory stores unless the host exposes an official API or documented export format. The portable guarantee applies to memories created and managed through Nuzo.

## Host Matrix

| Host | Current fit | Extension path | Nuzo package direction | Notes |
| --- | --- | --- | --- | --- |
| Codex | First supported plugin target. | Codex plugins can bundle MCP servers and skills. Codex also supports direct MCP configuration in `config.toml`. | `packages/codex-plugin` | The wrapper includes MCP metadata and concise host guidance for recall and confirmed capture. |
| Claude Code | Initial plugin wrapper scaffolded. | Claude Code plugins can include `.mcp.json` or inline MCP server config. Claude Code also supports direct MCP setup through `claude mcp`. | `packages/claude-code-plugin` | Keep Claude-specific metadata, MCP defaults, skills, and docs here only. |
| Other MCP-compatible agents | Future compatible target. | Direct MCP server configuration. | No package until a real host contract exists. | Support through `packages/mcp-server` first. |

## Codex Notes

Codex plugins can bundle skills, app integrations, and MCP servers. For Nuzo, the useful part is MCP server packaging.

Codex MCP support includes:

- stdio servers;
- streamable HTTP servers;
- server instructions;
- user and project configuration through `config.toml`;
- plugin-provided MCP servers.

Implications for Nuzo:

- Codex plugin packaging should point to the Nuzo MCP server.
- Business logic must stay out of `packages/codex-plugin`.
- Codex marketplace or sharing metadata should be added only after the plugin package is stable.
- Local marketplace helpers are development convenience, not the primary product path.

## Claude Code Notes

Claude Code supports plugins for reusable functionality across projects and teams. Plugins can include skills, agents, hooks, MCP servers, LSP servers, background monitors, binaries, and default settings.

Claude Code MCP support includes:

- remote HTTP servers;
- remote SSE servers, marked as deprecated in favor of HTTP where available;
- local stdio servers;
- remote WebSocket servers;
- `.mcp.json` project configuration;
- user and local MCP scopes;
- plugin-provided MCP servers;
- environment variables such as `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, and `${CLAUDE_PROJECT_DIR}` inside plugin MCP config.

Implications for Nuzo:

- A Claude Code package should use the same Nuzo MCP server.
- The current package is a thin plugin with `.claude-plugin/plugin.json`, `.mcp.json`, and a host-specific skill.
- Claude Code's direct `claude mcp add` path can remain documented as a manual setup path, but the primary direction is the supported plugin workflow.
- Do not add Claude-specific memory behavior to core or MCP handlers.

## Packaging Rules

Host packages may contain:

- plugin manifests;
- host-specific MCP config;
- host-specific setup docs;
- host-specific skill or instruction files when they improve discovery or usage;
- validation scripts for the host manifest.

Host packages must not contain:

- memory storage logic;
- recall ranking logic;
- policy checks;
- secret scanning;
- import/export implementation;
- host-specific versions of the MCP tool contract.

Host packages should expose Nuzo import/export actions when the host supports invoking MCP tools from the plugin. They should not create separate Codex or Claude export formats.

## Runtime Distribution

Development plugin configs may resolve the built MCP server from the monorepo.
Release artifacts must not.

For the MVP, generated Codex and Claude Code artifacts run a version-pinned
`@nuzo/mcp-server` through `npx`. This avoids global installation and avoids
shipping a platform-specific copy of the native SQLite dependency.

The authoritative decision is
`docs/adr/0006-host-plugin-runtime-distribution.md`.

## Naming Rules

Use neutral public language:

- "AI agents";
- "agent CLIs";
- "Codex and Claude Code";
- "MCP-compatible agents";
- "host integrations".

Avoid positioning Nuzo as:

- only a Codex plugin;
- only a Claude plugin;
- a replacement for built-in assistant memory;
- a sync service by default.

## Future Host Checklist

Before adding a new host package:

1. Confirm the host supports MCP or a compatible tool protocol.
2. Confirm whether the host has an official plugin/package mechanism.
3. Confirm how local processes are launched and how environment variables are passed.
4. Confirm where user-owned state should live.
5. Confirm how the host handles permissions, approvals, and tool visibility.
6. Keep the host package thin and route all memory behavior through MCP/core.

## Source References

- Codex manual, [Model Context Protocol](https://developers.openai.com/codex/mcp): Codex supports MCP servers in CLI and IDE extension.
- Codex manual, [Plugins](https://developers.openai.com/codex/plugins): Codex plugins can bundle MCP servers.
- Codex manual, [Memories](https://developers.openai.com/codex/memories): Codex memories are built-in generated state under Codex home, which is separate from Nuzo's user-controlled local memory store.
- Claude Code docs, [Create plugins](https://code.claude.com/docs/en/plugins): plugins can extend Claude Code with skills, agents, hooks, and MCP servers.
- Claude Code docs, [MCP](https://code.claude.com/docs/en/mcp): plugin-provided MCP servers start with the plugin and can be defined in `.mcp.json` or inline in `plugin.json`.
- Claude Code docs, [MCP](https://code.claude.com/docs/en/mcp): direct MCP setup supports HTTP, stdio, WebSocket, scoped configuration, and project `.mcp.json`.
