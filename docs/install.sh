#!/bin/sh

set -eu

VERSION="${NUZO_VERSION:-latest}"
PACKAGE_NAME="@nuzo/memory"
tmp_dir=""

usage() {
  cat <<'EOF'
Install Nuzo using npm.

Usage:
  install.sh [--version VERSION]

Environment:
  NUZO_VERSION  Version to install. Defaults to latest.

This installer installs @nuzo/memory only. It does not configure Codex,
Claude Code, MCP hosts, or lifecycle hooks automatically. After installation,
run:

  nuzo setup
EOF
}

step() {
  printf '==> %s\n' "$1"
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

prerequisite_help() {
  cat >&2 <<'EOF'

Install Node.js 22 LTS or 24 LTS with npm 10 or newer, then rerun this script.
This installer does not install system packages automatically.
Recommended sources:
  https://nodejs.org/
  https://github.com/nvm-sh/nvm
EOF
}

validate_version() {
  version="$1"

  if [ "$version" = "latest" ]; then
    return
  fi

  if ! printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
    fail "Invalid Nuzo version: $version. Expected latest or a SemVer version such as 1.0.0."
  fi
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --version)
        [ "$#" -ge 2 ] || fail "--version requires a value."
        VERSION="$2"
        shift
        ;;
      --help | -h)
        usage
        exit 0
        ;;
      *)
        fail "Unknown argument: $1"
        ;;
    esac
    shift
  done
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    prerequisite_help
    fail "$1 is required to install Nuzo."
  fi
}

download_file() {
  url="$1"
  output="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -q -O "$output" "$url"
    return
  fi

  fail "curl or wget is required to download the verified Nuzo package."
}

check_node_version() {
  node -e '
const major = Number(process.versions.node.split(".")[0]);
process.exit(major === 22 || major === 24 ? 0 : 1);
' || {
    prerequisite_help
    fail "Nuzo requires Node.js 22 LTS or 24 LTS."
  }
}

check_npm_version() {
  npm -v | awk -F. '
    /^[0-9]+(\.[0-9]+)*$/ {
      if ($1 >= 10) exit 0;
    }
    { exit 1 }
  ' || {
    prerequisite_help
    fail "Nuzo requires npm 10 or newer."
  }
}

resolve_package_metadata() {
  package_spec="$1"

  npm view "$package_spec" version dist.tarball dist.integrity --json | node -e '
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const input = Buffer.concat(chunks).toString("utf8");
  let metadata;
  try {
    metadata = JSON.parse(input);
  } catch {
    console.error("Could not parse npm package metadata.");
    process.exit(1);
  }

  const version = String(metadata.version ?? "");
  const tarball = String(metadata["dist.tarball"] ?? "");
  const integrity = String(metadata["dist.integrity"] ?? "");
  if (!version || !/^https:\/\/registry\.npmjs\.org\//.test(tarball) || !/^sha512-[A-Za-z0-9+/=]+$/.test(integrity)) {
    console.error("npm package metadata did not include a registry tarball and sha512 integrity.");
    process.exit(1);
  }

  console.log(version);
  console.log(tarball);
  console.log(integrity);
});
'
}

verify_integrity() {
  archive_path="$1"
  expected_integrity="$2"

  node - "$archive_path" "$expected_integrity" <<'NODE'
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");

const [, , archivePath, expectedIntegrity] = process.argv;
const actualIntegrity = `sha512-${createHash("sha512").update(readFileSync(archivePath)).digest("base64")}`;
if (actualIntegrity !== expectedIntegrity) {
  console.error("Downloaded Nuzo package integrity did not match npm metadata.");
  console.error(`expected: ${expectedIntegrity}`);
  console.error(`actual:   ${actualIntegrity}`);
  process.exit(1);
}
NODE
}

cleanup() {
  if [ -n "$tmp_dir" ]; then
    rm -rf "$tmp_dir"
  fi
}

main() {
  parse_args "$@"
  validate_version "$VERSION"

  require_command node
  require_command npm
  require_command mktemp
  check_node_version
  check_npm_version

  package_spec="$PACKAGE_NAME@$VERSION"

  step "Resolving $package_spec from npm"
  metadata="$(resolve_package_metadata "$package_spec")" || fail "Could not resolve $package_spec from npm."
  resolved_version="$(printf '%s\n' "$metadata" | sed -n '1p')"
  tarball_url="$(printf '%s\n' "$metadata" | sed -n '2p')"
  integrity="$(printf '%s\n' "$metadata" | sed -n '3p')"

  tmp_dir="$(mktemp -d)"
  trap cleanup EXIT INT TERM
  archive_path="$tmp_dir/nuzo-memory-$resolved_version.tgz"

  step "Downloading $PACKAGE_NAME@$resolved_version"
  download_file "$tarball_url" "$archive_path"

  step "Verifying npm package integrity"
  verify_integrity "$archive_path" "$integrity"

  step "Installing verified $PACKAGE_NAME@$resolved_version with npm"
  npm install --global "$archive_path"

  step "Validating Nuzo"
  command -v nuzo >/dev/null 2>&1 || fail "nuzo was not found on PATH after installation."
  nuzo --version

  cat <<'EOF'

Nuzo installed.

Next step:
  nuzo setup

`nuzo setup` reviews and configures Codex and Claude Code host integration.
This installer intentionally does not change host configuration automatically.
EOF
}

main "$@"
