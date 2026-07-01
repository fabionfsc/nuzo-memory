# Fresh Installation Walkthrough

This walkthrough verifies the public `0.9.1` release without cloning the Nuzo
repository. It uses fake data only.

## Prerequisites

- Node.js 22 LTS or 24 LTS.
- npm 10 or newer.
- A current Codex or Claude Code CLI when configuring a host plugin.

Check the runtime:

```bash
node --version
npm --version
```

Git, Python, and a source checkout are not required for normal installation.

## Option A: Nuzo For Codex Or Claude Code

```bash
npm install --global @nuzo/memory@0.9.1
nuzo setup
```

`nuzo setup` detects installed supported hosts, shows the planned host plugin
changes, and asks before changing Codex or Claude Code configuration.

For non-interactive environments:

```bash
# Codex
nuzo setup --codex --yes

# Claude Code
nuzo setup --claude-code --yes

# Both
nuzo setup --all --yes
```

Confirm that `nuzo@nuzo-memory` is enabled in the host. Start Codex or Claude
Code, open the host's hook view, review and trust the two Nuzo read-only recall
hooks, then start a new session.

Setup is one-time. After a package upgrade, `npm install --global
@nuzo/memory@latest` automatically refreshes already-installed Nuzo host
plugins. If npm lifecycle scripts are disabled or refresh needs attention, run
`nuzo update --yes` as the recovery path.

## Verify A Plugin Across Sessions

In the new host session, say:

```text
Save this in Nuzo memory: My clean-install marker is NUZO-CLEAN-OK.
```

Review and confirm the draft. Close that session, start another one, and ask:

```text
What is my Nuzo clean-install marker?
```

The answer should use `NUZO-CLEAN-OK`.

If the marker is missing, follow the [Codex](../operations/codex-plugin.md) or
[Claude Code](../operations/claude-code-plugin.md) host checks.

## Option B: Shell CLI Only

If you only want local memory administration without configuring a host plugin,
install the public package:

```bash
npm install --global @nuzo/memory@0.9.1
nuzo --version
```

For the default local store, open the terminal memory manager with:

```bash
nuzo memory manage
```

Use a temporary store so this walkthrough does not touch existing memory:

```bash
NUZO_WALKTHROUGH_DIR=/tmp/nuzo-walkthrough
NUZO_STORE="$NUZO_WALKTHROUGH_DIR/memories.sqlite"
NUZO_EXPORT="$NUZO_WALKTHROUGH_DIR/memories.memory.export.json"
mkdir -p "$NUZO_WALKTHROUGH_DIR"
```

Initialize and inspect it:

```bash
nuzo memory --store "$NUZO_STORE" init
nuzo memory --store "$NUZO_STORE" doctor
nuzo memory --store "$NUZO_STORE" manage
```

Store and recall fake project context:

```bash
nuzo memory --store "$NUZO_STORE" remember \
  "The demo project uses SQLite for local storage." \
  --kind project_decision \
  --tag demo \
  --tag storage

nuzo memory --store "$NUZO_STORE" recall "demo storage"
nuzo memory --store "$NUZO_STORE" list --tag demo
```

## Verify Portability

Create a portable JSON export:

```bash
nuzo memory --store "$NUZO_STORE" export --path "$NUZO_EXPORT"
nuzo memory --store "$NUZO_STORE" import "$NUZO_EXPORT" --dry-run
```

## Option D: Generic MCP Host

Configure this process as a stdio MCP server:

```bash
npm exec --yes --package=@nuzo/memory@0.9.1 -- nuzo-mcp-server
```

The host should discover the [14 public memory tools](../spec/tools.md). Use
`memory.doctor` for content-free runtime diagnostics.

## Cleanup

When the CLI walkthrough is finished:

```bash
rm -rf "$NUZO_WALKTHROUGH_DIR"
```

This removes only the temporary path defined above.

## Troubleshooting

### Native SQLite installation fails

Nuzo uses `better-sqlite3`. Confirm that a supported Node.js LTS release is
active, then follow the [runtime support guide](../operations/runtime-support.md)
for platform build tools.

### Doctor cannot inspect Git

Restricted sandboxes may block child processes. This affects only the Git
tracking diagnostic; it does not imply that SQLite memory is unhealthy. Normal
host and terminal environments should leave the check enabled.

### Source development

Repository cloning, `npm ci`, builds, tests, and documentation tooling are
contributor workflows. Follow the
[contribution guide](https://github.com/fabionfsc/nuzo-memory/blob/main/CONTRIBUTING.md)
instead of mixing them into a public package installation.
