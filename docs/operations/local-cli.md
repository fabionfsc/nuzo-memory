# Local CLI

Nuzo's local CLI command is `nuzo`.

## Install

Use Node.js 22 LTS or 24 LTS with npm 10 or newer.

```bash
npm install --global @nuzo/memory@0.9.1
nuzo memory init
nuzo memory doctor
```

This installs the shell CLI and the runtime used by Nuzo-managed Codex and
Claude Code plugins.

## Setup And Managed Updates

After installing the global package, use one-time host setup when you want
Nuzo to configure Codex, Claude Code, or both:

```bash
nuzo setup
```

When both supported hosts are detected, `nuzo setup` asks whether to configure
Codex, Claude Code, or both before showing the final plan and confirmation.

For non-interactive use:

```bash
# Codex
nuzo setup --codex --yes

# Claude Code
nuzo setup --claude-code --yes

# Both
nuzo setup --all --yes
```

Do not rerun setup after an upgrade. Update the global package normally; the
package postinstall refreshes already-installed Nuzo host plugins that were
managed by `nuzo setup`:

```bash
npm install --global @nuzo/memory@latest
```

Use `nuzo update --yes` when npm lifecycle scripts are disabled or the
automatic refresh reports that manual attention is needed. Use
`nuzo update --dry-run` to inspect the plan. Use `nuzo update --codex --yes` or
`nuzo update --claude-code --yes` to target one host. Missing plugins are not
installed by an update.

## Common Commands

```bash
nuzo memory init
nuzo memory init --project
nuzo memory remember "The project uses SQLite for local storage." --kind project_decision --tag storage
nuzo memory suggest-capture "The user prefers concise final answers." --kind preference --reason "Durable response style preference."
nuzo memory recall "local storage"
nuzo memory list --all-scopes
nuzo memory manage
nuzo memory export --path ./memories.memory.export.json
nuzo memory history mem_01HZY
nuzo memory audit --scope project:auto --event-type memory.exported
nuzo memory forget-many --tag obsolete
nuzo memory forget-many --scope project:auto --apply
```

## Runtime Configuration

Project init creates `.nuzo/config.json`, a project-local SQLite store, and
missing Git ignore rules. Later CLI commands run from the project root or any
nested directory discover that config and resolve the same store and hashed
project scope automatically.

Runtime precedence is explicit flags, environment overrides, project config,
user config, then built-in defaults. The same resolver is used by the CLI, MCP
server, and packaged host hooks.

Useful environment overrides:

| Variable | Purpose |
| --- | --- |
| `NUZO_MEMORY_STORE` | Select a SQLite store path for CLI, MCP, or hooks. |
| `NUZO_MEMORY_SCOPE` | Select the default scope; `project:auto` resolves to the current project hash. |
| `NUZO_PROJECT_ROOT` | Set an exact existing project root instead of ancestor discovery. |
| `NUZO_AUTHORIZATION_MODE` | Set host authorization to `restricted` or `administrator`. The local CLI remains administrator-oriented. |
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

## Export And Import

Use JSON or Markdown export when you need a portable memory document:

```bash
nuzo memory export --path ./memories.memory.export.json
```

Preview an import before writing:

```bash
nuzo memory import ./memories.memory.export.json --dry-run
```

Apply the import only after reviewing the preflight output:

```bash
nuzo memory import ./memories.memory.export.json
```

Use the CLI commands when you are administering a local store from a shell.
Inside Codex, Claude Code, or another MCP host, call `memory.doctor` instead.
Doctor diagnostics remain content-free and report runtime readiness without
returning stored memory text.

The default doctor pass is read-only and inspects Git tracking, SQLite
integrity, and runtime file hygiene:

```bash
nuzo memory doctor
```

Add `--scan-secrets` only when you intentionally want a full scan of active
memory records:

```bash
nuzo memory doctor --scan-secrets --json
```

The scan reports counts and finding kinds, never memory content or matched
fragments. Doctor reports unsafe permissions, ownership, symlinks, stale
temporary/backup artifacts, and unexpected runtime files but does not repair or
delete them. Review findings before changing files. `memory.doctor` provides
the same content-free file-hygiene report to hosts and directs full secret scans
to the local CLI.

## Authorization Boundary

The local CLI is an administrator workflow over the selected store. Scope
flags filter which records an operation targets; they do not restrict what the
CLI process is allowed to access. A CLI process with access to the store can
use `--all-scopes` and perform authorized administrator operations across it.

Repository-controlled agents should use a restricted MCP session with an
explicit core-policy allowlist instead of treating a project scope as an access
control boundary. Use separate stores and operating-system permissions when
process-level isolation is required.

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
