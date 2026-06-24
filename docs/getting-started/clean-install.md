# Clean Install Walkthrough

This walkthrough starts from a clean checkout and uses fake memory data only.

It verifies both the public CLI package and the monorepo workflow.

## Prerequisites

- Git.
- Node.js 22 LTS or 24 LTS.
- npm 10 or newer.
- Python 3, only if building the docs site locally.

Check:

```bash
node --version
npm --version
python3 --version
```

Other Node.js major versions are not claimed as supported until they are part
of the CI matrix. See the [runtime support policy](../operations/runtime-support.md).

## Clone And Install

Verify the released CLI without cloning:

```bash
NUZO_PUBLISHED_DIR=/tmp/nuzo-published-cli
rm -rf "$NUZO_PUBLISHED_DIR"
npm install --prefix "$NUZO_PUBLISHED_DIR" @nuzo/memory-cli@0.1.1
"$NUZO_PUBLISHED_DIR/node_modules/.bin/nuzo" memory --store /tmp/nuzo-published.sqlite init
NUZO_DOCTOR_SKIP_GIT=1 "$NUZO_PUBLISHED_DIR/node_modules/.bin/nuzo" memory --store /tmp/nuzo-published.sqlite doctor
rm -rf "$NUZO_PUBLISHED_DIR"
rm -f /tmp/nuzo-published.sqlite /tmp/nuzo-published.sqlite-*
```

Then clone the source workspace:

```bash
git clone https://github.com/fabionfsc/nuzo-memory.git
cd nuzo-memory
npm ci
```

Use `npm install` only when intentionally changing dependencies.

## Build And Validate

```bash
npm run check
npm test
npm run build
```

Optional docs validation:

```bash
python3 -m venv .venv-docs
.venv-docs/bin/pip install -r requirements-docs.txt
.venv-docs/bin/mkdocs build --strict
```

## Run The CLI

Use a temporary store so the walkthrough does not touch real memory:

```bash
NUZO_WALKTHROUGH_DIR=/tmp/nuzo-walkthrough
NUZO_STORE="$NUZO_WALKTHROUGH_DIR/memories.sqlite"
NUZO_EXPORT="$NUZO_WALKTHROUGH_DIR/memories.memory.export.json"
NUZO_IMPORTED_STORE="$NUZO_WALKTHROUGH_DIR/imported.sqlite"
mkdir -p "$NUZO_WALKTHROUGH_DIR"
```

Initialize the store:

```bash
npm run nuzo -- memory --store "$NUZO_STORE" init
```

Run doctor:

```bash
npm run nuzo -- memory --store "$NUZO_STORE" doctor
```

In restricted agent sandboxes, the Git tracking check may report unavailable if the environment blocks child process execution. That should not prevent the rest of the walkthrough from working.

## Remember And Recall

Store fake project context:

```bash
npm run nuzo -- memory --store "$NUZO_STORE" remember "The demo project uses SQLite for local storage." --kind project_decision --tag demo --tag storage
```

Recall it:

```bash
npm run nuzo -- memory --store "$NUZO_STORE" recall "local storage"
```

List stored memories:

```bash
npm run nuzo -- memory --store "$NUZO_STORE" list --tag demo
```

## Export And Import

Export as JSON:

```bash
npm run nuzo -- memory --store "$NUZO_STORE" export --path "$NUZO_EXPORT"
```

Dry-run import into a separate store:

```bash
npm run nuzo -- memory --store "$NUZO_IMPORTED_STORE" import "$NUZO_EXPORT" --dry-run
```

Import for real:

```bash
npm run nuzo -- memory --store "$NUZO_IMPORTED_STORE" import "$NUZO_EXPORT"
```

Confirm recall from the imported store:

```bash
npm run nuzo -- memory --store "$NUZO_IMPORTED_STORE" recall "SQLite storage"
```

## Cleanup

Remove the temporary walkthrough store:

```bash
rm -rf /tmp/nuzo-walkthrough
```

Do not commit runtime memory stores or exports.

## Troubleshooting

### `better-sqlite3` install or build fails

Confirm that Node.js 22 LTS or 24 LTS and npm 10 or newer are active:

```bash
node --version
npm --version
npm ci
```

If npm cannot use a prebuilt binary, `better-sqlite3` requires a local C/C++
build toolchain and Python. Follow the platform-specific steps in the
[runtime support policy](../operations/runtime-support.md).

### `nuzo memory doctor` reports Git tracking unavailable

This can happen in restricted sandboxes that block child processes. In a normal Git checkout, doctor should be able to inspect tracked memory files.

For smoke tests or restricted hosts where Git process execution is not
available, use:

```bash
NUZO_DOCTOR_SKIP_GIT=1 npm run nuzo -- memory --store "$NUZO_STORE" doctor
```

This skips only the Git tracking check. Missing stores, missing directories,
and tracked memory files in normal checkouts remain warnings.

### `npm run nuzo` cannot find `dist/index.js`

Build first:

```bash
npm run build
```

### Export files appear in `git status`

Use the ignored export suffixes:

```text
*.memory.export.json
*.memory.export.md
```

Avoid custom export filenames that do not match those patterns.
