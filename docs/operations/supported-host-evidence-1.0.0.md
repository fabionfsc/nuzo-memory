# 1.0.0 Supported Host Evidence

Date: 2026-07-12.

This report records the post-1.0 adoption validation run for issue
[#316](https://github.com/fabionfsc/nuzo-memory/issues/316). It uses synthetic
memory only and separates runtime delivery evidence from interactive model
behavior.

## Environment

| Component | Evidence environment |
| --- | --- |
| Operating system | Linux x64 |
| Node.js | 22.22.3 |
| npm | 10.9.8 |
| Codex CLI | 0.144.1, installed locally |
| Claude Code CLI | 2.1.195, invoked from its pinned npm package in a temporary HOME |
| Nuzo public runtime | `@nuzo/memory@1.0.0` from npm |
| Nuzo source artifact | `1.0.0` staged from commit `b562969` plus the corrections in this change |

Temporary prefixes, HOME directories, stores, plugin caches, and Docker
containers were removed by their harnesses. The authenticated Codex profile
was changed only for the host-native test and restored afterward; no personal
Nuzo store was used.

## Evidence Matrix

| Flow | Public 1.0.0 | Current staged artifact | Result |
| --- | --- | --- | --- |
| npm install and CLI session continuity | Real registry package | Packaged tarball | Passed |
| MCP stdio continuity across processes | Real registry package | Packaged tarball | Passed |
| Default optional-semantics fallback | Real registry package | Existing benchmark and artifact gates | Passed |
| Installer on Node 22 Debian | Real registry package in Docker | Not applicable | Passed |
| Installer on Node 24 Alpine | Real registry package in Docker | Not applicable | Passed |
| Codex marketplace lifecycle | `nuzo@nuzo-memory@1.0.0` in temporary `CODEX_HOME` | Generated marketplace artifact | Passed |
| Claude Code marketplace lifecycle | `nuzo@nuzo-memory@1.0.0` in temporary HOME | Generated marketplace artifact | Passed |
| Codex `SessionStart` hook, two fresh invocations | Public hook runtime and public-schema fixture | Current hook runtime and current-schema fixture | Passed |
| Claude Code `SessionStart` hook, two fresh invocations | Public hook runtime and public-schema fixture | Current hook runtime and current-schema fixture | Passed |
| Unrelated `UserPromptSubmit` remains quiet | Public hook runtime | Current hook runtime | Passed |
| Recall hook makes no memory/audit write | History compared before and after hooks | History compared before and after hooks | Passed |
| 0.9.0 to 1.0.0 managed upgrade | Public baseline to staged package | Setup/update host shims and shared store | Passed |
| Backup/restore after upgrade | Public baseline to staged package | Temporary SQLite stores | Passed |
| Authenticated Codex hook response | Public 1.0.0 runtime through corrected local plugin | Synthetic marker in an isolated store | Passed |
| Authenticated Codex `memory.recall` | Public 1.0.0 MCP runtime through corrected local plugin | Same synthetic marker and store | Passed |

The native marketplace run exercised add, list, update/upgrade, disable,
enable, uninstall, and reinstall operations. Both generated host artifacts
delivered the same `user:default` fake autoload memory inside the documented
untrusted-data envelope.

## Findings And Corrections

The first published canary attempt failed after schema version 7 landed on
`main`. The harness created its fixture with the source core, then invoked the
published 1.0.0 hook runtime, which supports the older public schema. The
runtime correctly refused the future schema and skipped recall.

That was a harness composition error, not a public-runtime continuity failure.
Published mode now installs `@nuzo/memory@1.0.0`, creates the fixture with its
CLI, invokes both published hooks, and compares history with the same published
CLI. A release-tool contract test protects this boundary.

The first authenticated Codex run exposed a product defect: the published hook
command inherited the user's project directory. Inside the Nuzo monorepo, npm
resolved the local workspace package instead of the version-pinned public
package, so `nuzo-memory-hook` was not available. The Codex MCP process had the
same isolation risk. Generated and tracked hooks now pass
`--prefix=${CLAUDE_PLUGIN_ROOT}`, Codex resolves MCP `cwd` from `.` at the
plugin root, and Claude Code keeps its documented `${CLAUDE_PLUGIN_ROOT}` cwd.
The published canary now invokes hooks from the repository root so workspace
shadowing is a permanent regression case.

Codex 0.144.1 also established that its structured MCP `cwd` treats `.` as
plugin-relative, but does not expand `${CLAUDE_PLUGIN_ROOT}` there. Hook command
strings do expand that plugin variable. The host-specific generated configs now
encode this distinction explicitly.

## Public Site And Feedback Path

The adoption documentation from PR
[#317](https://github.com/fabionfsc/nuzo-memory/pull/317) deployed successfully
through [Pages run 29193307355](https://github.com/fabionfsc/nuzo-memory/actions/runs/29193307355).
The home page, 60-second demo, Why Nuzo guide, and feedback page each returned
HTTP 200 after deployment.

The dedicated Installation Feedback form is present in the repository and
requires fake-data confirmation. Opening a synthetic issue solely to test the
form would create public tracker noise, so schema parsing and rendered form
availability are the non-mutating validation used here.

## Host-Native Boundary

An authenticated Codex 0.144.1 session loaded the corrected local plugin while
running from the monorepo. `SessionStart` and `UserPromptSubmit` completed, the
model included the synthetic `NUZO-CODEX-REAL-20260712` marker in its response,
and a separate session completed `nuzo/memory.recall` against the same isolated
store and returned the marker. This proves delivery and one observed compliant
response, not unconditional model obedience.

Claude Code was not authenticated on this machine. Its remaining evidence is
narrow:

1. install the corrected Nuzo artifact into an authenticated Claude Code
   profile;
2. save fake data, close the session, and verify recall in a fresh session;
3. record delivery separately from whether the model follows recalled text.

Issue #316 remains open for that authenticated Claude Code check. The Codex
interactive check and all automated install, marketplace, runtime,
hook-delivery, zero-write, upgrade, and recovery portions are complete.

## Commands

```bash
npm run smoke:published:cli
npm run smoke:published:mcp
npm run smoke:published:semantics
NUZO_HOST_CANARY_NATIVE=1 npm run smoke:host-canary
NUZO_HOST_CANARY_NATIVE=1 NUZO_PLUGIN_SMOKE_PUBLISHED=1 \
  npm run smoke:host-canary
npm run gate:developer-experience
npm run smoke:installer
```
