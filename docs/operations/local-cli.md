# Local CLI

Nuzo's local CLI command is `nuzo`.

## Install

Use Node.js 22 LTS or 24 LTS with npm 10 or newer.

```bash
npm install --global @nuzo/memory
nuzo memory init
nuzo memory doctor
```

## Common Commands

```bash
nuzo memory init
nuzo memory init --project
nuzo memory remember "The project uses SQLite for local storage." --kind project_decision --tag storage
nuzo memory suggest-capture "The user prefers concise final answers." --kind preference --reason "Durable response style preference."
nuzo memory recall "local storage"
nuzo memory list --all-scopes
nuzo memory export --path ./memories.memory.export.json
nuzo memory history mem_01HZY
nuzo memory audit --scope project:auto --event-type memory.exported
nuzo memory forget-many --tag obsolete
nuzo memory forget-many --scope project:auto --apply
```

## Source Development

The CLI source lives at `packages/cli`. Contributors can use the workspace
wrapper after building:

```bash
npm ci
npm run build
npm run nuzo -- memory doctor
```

Arguments after `--` are passed to the CLI.

Project init creates `.nuzo/config.json`, a project-local SQLite store, and
missing Git ignore rules. Later CLI commands run from that project root resolve
the project store and hashed project scope automatically.

Runtime precedence is explicit flags, environment overrides, project config,
user config, then built-in defaults. The same resolver is used by the CLI, MCP
server, and packaged host hooks.

Useful environment overrides:

| Variable | Purpose |
| --- | --- |
| `NUZO_MEMORY_STORE` | Select a SQLite store path for CLI, MCP, or hooks. |
| `NUZO_MEMORY_SCOPE` | Select the default scope; `project:auto` resolves to the current project hash. |
| `NUZO_AUTHORIZED_SCOPES` | Restrict MCP/hook sessions to a comma-separated scope allowlist. The local CLI remains administrator-oriented. |

Recall reads config defaults for result limit, global-scope inclusion, and
optional recall-event recording. Use `--no-include-global` to override a config
that enables global recall for one command.

Recall remains FTS-only unless `--mode semantic` or `--mode hybrid` is passed.
Use `--json` to receive results with machine-readable requested/effective mode
and fallback diagnostics. The optional model and sidecar workflow is described
in [Optional Semantics](optional-semantics.md).

`nuzo memory suggest-capture` validates an inferred memory draft without writing
storage, audit history, or usage metadata. Use it before asking the user to
confirm a memory inferred from conversation context. Pass `--json` when a host,
script, or agent needs a machine-readable result close to the MCP
`memory.suggest_capture` shape. Pass `--relationship-mode bounded` to request
the opt-in `0.6.0` relationship evidence contract; omitting it keeps the
exact-only compatibility behavior.

`nuzo memory confirm-capture` applies an explicit user decision after a draft
has been shown. `create`, `keep_separate`, and `update` require `--yes`.
`update` also requires `--target-memory-id` and `--expected-revision` from the
memory shown to the user. `reject` and `clarify` write nothing.

`list --all-scopes` is an administrator audit view for the selected local
store. It is also the recovery path for literal `project:auto` records created
before `0.2.1`; `doctor` warns when active records require review.

`memory history <id>` shows audit events for one memory ID. `memory audit`
shows bounded store-wide audit events, including global events such as exports
where `memory_id` is `global` in CLI output. Filter with `--memory-id`,
`--event-type`, `--actor`, `--scope`, `--since`, `--until`, and `--limit`.
Audit output is metadata-only and does not include memory content.

## Authorization Boundary

The local CLI is an administrator workflow over the selected store. Scope
flags filter which records an operation targets; they do not restrict what the
CLI process is allowed to access. A CLI process with access to the store can
use `--all-scopes` and perform authorized administrator operations across it.

Repository-controlled agents should use a restricted MCP session with an
explicit core-policy allowlist instead of treating a project scope as an access
control boundary. Use separate stores and operating-system permissions when
process-level isolation is required.

## Smoke Test

Run:

```bash
npm run smoke:cli
```

This builds the workspace and runs:

```bash
nuzo memory doctor
```

against a temporary store path under `/tmp`.

The smoke script sets:

```bash
NUZO_DOCTOR_SKIP_GIT=1
```

This keeps restricted agent environments from turning an otherwise healthy
temporary store into a warning only because Git process execution is
unavailable. Normal `nuzo memory doctor` runs still check for tracked memory
files by default.

For a fuller clean install and import/export walkthrough, see `docs/getting-started/clean-install.md`.

## Package Direction

The public command should remain:

```bash
nuzo
```

The memory commands should remain grouped under:

```bash
nuzo memory
```

The released user package is `@nuzo/memory`; the user-facing command stays
`nuzo`.

## Boundaries

The CLI must call `packages/core` use cases.

Do not add memory business logic, storage rules, import/export rules, or policy checks directly in the CLI.

## Exit Codes

The `nuzo` process uses stable exit codes:

| Code | Meaning |
| --- | --- |
| `0` | Command completed successfully. Doctor warnings are reported in output but remain a successful diagnostic run. |
| `1` | Nuzo operational or policy error, with a structured code such as `MEMORY_SECRET_DETECTED`. |
| `2` | Invalid command, option, or argument usage. |
| `70` | Unexpected internal CLI failure. Output stays concise and does not print a stack trace. |

## Git Safety

Runtime memory and exports must stay out of Git:

```text
~/.nuzo/memory/
.nuzo/memory/
*.memory.export.json
*.memory.export.md
*.sqlite
*.sqlite-*
```

If a host blocks child process execution and the Git tracking check is not
meaningful, run doctor with:

```bash
NUZO_DOCTOR_SKIP_GIT=1 nuzo memory doctor
```

Use this only for restricted environments or smoke tests. In a normal checkout,
leave Git tracking enabled so doctor can warn about committed memory files.
