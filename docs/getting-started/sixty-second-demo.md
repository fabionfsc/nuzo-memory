# 60-Second Demo

This demo uses the public Nuzo `1.2.0` package and a disposable store. It does
not configure a host, touch your default memory, or use real personal data.

Prerequisites: Node.js 22 LTS or 24 LTS and npm 10 or newer.

## Install

```bash
npm install --global @nuzo/memory@1.2.0
nuzo --version
```

## Remember, Recall, And Inspect

Copy this block into a POSIX shell:

```bash
export NUZO_DEMO_DIR="${TMPDIR:-/tmp}/nuzo-60-second-demo"
export NUZO_DEMO_STORE="$NUZO_DEMO_DIR/memories.sqlite"
rm -rf "$NUZO_DEMO_DIR"
mkdir -p "$NUZO_DEMO_DIR"

nuzo memory --store "$NUZO_DEMO_STORE" init
NUZO_DEMO_ID="$(nuzo memory --store "$NUZO_DEMO_STORE" remember \
  "The demo project validates changes with npm test." \
  --kind project_decision \
  --tag demo)"
nuzo memory --store "$NUZO_DEMO_STORE" recall "How does the demo validate changes?"
nuzo memory --store "$NUZO_DEMO_STORE" list --tag demo
nuzo memory --store "$NUZO_DEMO_STORE" audit --memory-id "$NUZO_DEMO_ID"
```

The recall and list results should contain `npm test`. The list and audit
commands show that the result is a structured record with revision, scope,
kind, source actor, and lifecycle history rather than hidden host state.

## Clean Up

```bash
rm -rf "$NUZO_DEMO_DIR"
unset NUZO_DEMO_DIR NUZO_DEMO_STORE NUZO_DEMO_ID
```

To prove continuity through an agent host, continue with the
[cross-session verification](index.md#verify-a-host-installation). That flow
uses an explicit capture confirmation and a fresh Codex or Claude Code session.
