# @nuzo/memory

The official Nuzo package for local, inspectable agent memory. It includes the
`nuzo` CLI, the MCP server, and the read-only lifecycle hook runner used by
Codex and Claude Code plugins.

## Codex

Normal Codex users should install the Nuzo plugin, which obtains its matching
runtime automatically:

```bash
codex plugin marketplace add fabionfsc/nuzo-memory
codex plugin add nuzo@nuzo-memory
```

Open `/plugins` to confirm Nuzo is enabled, review and trust its hooks in
`/hooks`, then start a new thread. A separate global npm install is not
required unless you also want the shell CLI.

## Claude Code

```bash
claude plugin marketplace add fabionfsc/nuzo-memory
claude plugin install nuzo@nuzo-memory --scope user
```

Confirm `nuzo@nuzo-memory` with `claude plugin list --json`, inspect `/mcp` and
`/hooks`, then start a new session. A separate global npm install is not
required unless you also want the shell CLI.

## Shell CLI And Host Setup

```bash
npm install --global @nuzo/memory@0.9.0
nuzo memory init
nuzo memory doctor
```

Store and recall safe test data:

```bash
nuzo memory remember "The demo project uses SQLite." --kind project_decision --tag demo
nuzo memory recall "demo storage"
```

To let Nuzo detect and configure installed hosts from the global package, run:

```bash
nuzo setup
nuzo setup --codex --yes
nuzo setup --claude-code --yes
nuzo setup --all --yes
```

After package upgrades, `nuzo update --yes` refreshes already-installed Nuzo
host plugins. It does not repeat setup or silently install missing plugins.

## Verify Memory Across Sessions

In a new Codex or Claude Code session, say:

```text
Save this in Nuzo memory: My installation test marker is NUZO-OK.
```

Review and confirm the draft. Start another new session and ask:

```text
What is my Nuzo installation test marker?
```

The answer should use `NUZO-OK`.

## Generic MCP Host

Configure this package as a stdio MCP server:

```bash
npm exec --yes --package=@nuzo/memory -- nuzo-mcp-server
```

## Included Binaries

| Binary | Purpose |
| --- | --- |
| `nuzo` | Inspect and administer local memory. |
| `nuzo-mcp-server` | Expose Nuzo memory tools over MCP stdio. |
| `nuzo-memory-hook` | Provide bounded read-only host recall hooks. |

Runtime memory is stored locally under `~/.nuzo/memory/`. The CLI, MCP server,
and hook runner share these optional overrides:

| Variable | Purpose |
| --- | --- |
| `NUZO_MEMORY_STORE` | Select the SQLite store path. |
| `NUZO_MEMORY_SCOPE` | Select the default scope; `project:auto` resolves from the active project path. |
| `NUZO_PROJECT_ROOT` | Select the active project root; otherwise Nuzo discovers the nearest ancestor project config. |
| `NUZO_AUTHORIZATION_MODE` | Select `restricted` or `administrator` host authorization. |
| `NUZO_AUTHORIZED_SCOPES` | Restrict MCP/hook access to a comma-separated scope allowlist. |

Nuzo does not enable telemetry or remote embeddings by default. Suggested
memories require explicit confirmation, and recalled memory remains untrusted
data rather than agent instructions.

Optional local hybrid retrieval is available through an explicitly installed
`@huggingface/transformers@4.2.0` peer and separately provisioned model. See
the [optional semantics guide](https://nuzo.com.br/operations/optional-semantics/).

Use `@nuzo/memory-core` only for library-level integrations.

Documentation: https://nuzo.com.br/

License: Apache-2.0
