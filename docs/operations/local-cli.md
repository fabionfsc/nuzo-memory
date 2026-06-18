# Local CLI

Nuzo's local CLI command is `nuzo`.

The CLI package currently lives at `packages/cli` and exposes the `nuzo` binary from `packages/cli/dist/index.js`.

## Current Monorepo Path

Use Node.js 22 LTS or 24 LTS with npm 10 or newer.

Until release packaging is finalized, use the root workspace wrapper:

```bash
npm install
npm run build
npm run nuzo -- memory doctor
```

The wrapper runs:

```bash
node packages/cli/dist/index.js
```

Arguments after `--` are passed to the CLI.

Examples:

```bash
npm run nuzo -- memory init
npm run nuzo -- memory remember "The project uses SQLite for local storage." --kind project_decision --tag storage
npm run nuzo -- memory recall "local storage"
npm run nuzo -- memory export --path ./memories.memory.export.json
```

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

The package name can change before public release, but the user-facing command should stay stable.

## Boundaries

The CLI must call `packages/core` use cases.

Do not add memory business logic, storage rules, import/export rules, or policy checks directly in the CLI.

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
