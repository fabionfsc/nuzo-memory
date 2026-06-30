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

## Native SQLite Dependency

Nuzo uses `better-sqlite3`, which includes a native Node.js module.

On common supported platforms, npm should download a prebuilt binary. If no
compatible prebuild is available, installation falls back to compiling the
module locally.

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
