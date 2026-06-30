# Runtime Support

Nuzo requires:

- Node.js 22 or newer;
- npm 10 or newer.

The supported and continuously tested Node.js lines for the MVP are:

| Runtime | Support |
| --- | --- |
| Node.js 22 LTS | Supported and tested in CI. |
| Node.js 24 LTS | Supported and tested in CI. |
| Older than Node.js 22 | Unsupported. |
| Other Node.js major versions | Not claimed as supported until added to CI. |

The `engines` fields express the minimum runtime requirement. They do not replace
the tested-version policy above. A newer or non-LTS major may satisfy `>=22`
without being part of the supported CI matrix.

## Operating System And Architecture Matrix

The Node.js policy above is separate from the operating-system policy. For
`0.9.0`, Nuzo claims support only for the OS/architecture combinations that CI
tests with staged npm artifacts:

| Platform | Architecture | CI runner | Node.js lines | Support |
| --- | --- | --- | --- | --- |
| Linux x64 | x64 | `ubuntu-latest` | 22 LTS, 24 LTS | Supported and tested for staged npm artifacts. |
| macOS x64 | x64 | `macos-15-intel` | 22 LTS, 24 LTS | Supported and tested for staged npm artifacts. |
| Windows x64 | x64 | `windows-latest` | 22 LTS, 24 LTS | Supported and tested for staged npm artifacts. |

The staged artifact smoke installs generated `@nuzo/memory-core` and
`@nuzo/memory` tarballs, exercises the installed `nuzo` CLI, validates MCP
stdio session continuity through the installed `nuzo-mcp-server` binary,
checks the installed `nuzo-memory-hook --doctor` path, and validates generated
Codex and Claude Code plugin command forms.

Other combinations are not claimed as supported until they are added to the
matrix. In particular:

- Linux arm64 and macOS arm64 are expected to work when `better-sqlite3` has a
  compatible prebuild or the local source-build toolchain is available, but
  they are not release-blocking support lanes yet.
- Linux musl distributions such as Alpine are not claimed as supported for
  `0.9.0`; use glibc-based Linux or validate the native SQLite build path
  locally.
- Windows arm64 is not claimed as supported until CI or release validation
  covers it.

## Native SQLite Dependency

Nuzo uses `better-sqlite3`, which includes a native Node.js module.

On common supported platforms, npm should download a prebuilt binary. If no
compatible prebuild is available, installation falls back to compiling the
module locally.

### Accepted `prebuild-install` Warning At The `0.9.0` Freeze

As of 2026-06-30, `better-sqlite3@12.11.1` is the latest supported upstream
release and still depends on deprecated `prebuild-install@7.1.3`. Upstream is
tracking replacement work in
[`better-sqlite3#655`](https://github.com/WiseLibs/better-sqlite3/issues/655)
and the current warning in
[`better-sqlite3#1463`](https://github.com/WiseLibs/better-sqlite3/issues/1463).

Nuzo accepts this transitive deprecation warning for the `0.9.0` contract
freeze because:

- npm reports no known vulnerability in the current dependency tree;
- no newer `better-sqlite3` release removes the dependency;
- replacing or downgrading the SQLite driver would add data and platform risk
  without removing a known vulnerability;
- staged clean installs and native SQLite workflows are tested on Node.js 22
  and 24 across Linux x64, macOS x64, and Windows x64.

This is a bounded upstream dependency acceptance, not a suppression. Recheck
the latest upstream release and `npm audit` at every release gate. Upgrade when
the supported driver adopts a maintained prebuild path and the full artifact
matrix passes. Do not add an override for a native installer the parent package
was not designed to use.

Use a supported LTS release before troubleshooting:

```bash
node --version
npm --version
```

If compilation is required, install the platform toolchain:

=== "Ubuntu or Debian"

    ```bash
    sudo apt-get update
    sudo apt-get install -y build-essential python3
    npm install --global @nuzo/memory
    ```

=== "macOS"

    ```bash
    xcode-select --install
    npm install --global @nuzo/memory
    ```

=== "Windows"

    Install Python and Visual Studio Build Tools with the **Desktop development
    with C++** workload, then run:

    ```powershell
    npm install --global @nuzo/memory
    ```

If installation still fails:

1. Confirm the active Node.js version is 22 LTS or 24 LTS.
2. Run `npm cache verify`.
3. Retry `npm install --global @nuzo/memory` and inspect the first native build
   error.
4. Confirm that Python, a C/C++ compiler, and the platform build tools are
   available in the same shell.

Contributors installing from a source checkout should use `npm ci` and retain
the committed lockfile. That is a separate workflow from public package
installation.

## Changing The Policy

A runtime support change must update together:

- root and workspace `package.json` engine declarations;
- the Node.js matrix in `.github/workflows/ci.yml`;
- clean install and release documentation;
- `CHANGELOG.md` when the change affects users.

Dropping a supported Node.js line after the first public release is a breaking
change.
