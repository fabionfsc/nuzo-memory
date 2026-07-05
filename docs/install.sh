#!/bin/sh

set -eu

VERSION="${NUZO_VERSION:-latest}"
PACKAGE_NAME="@nuzo/memory"

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
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required to install Nuzo."
}

check_node_version() {
  node -e '
const major = Number(process.versions.node.split(".")[0]);
process.exit(major === 22 || major === 24 ? 0 : 1);
' || fail "Nuzo requires Node.js 22 LTS or 24 LTS."
}

check_npm_version() {
  npm -v | awk -F. '
    /^[0-9]+(\.[0-9]+)*$/ {
      if ($1 >= 10) exit 0;
    }
    { exit 1 }
  ' || fail "Nuzo requires npm 10 or newer."
}

main() {
  parse_args "$@"
  validate_version "$VERSION"

  require_command node
  require_command npm
  check_node_version
  check_npm_version

  package_spec="$PACKAGE_NAME@$VERSION"

  step "Installing $package_spec with npm"
  npm install --global "$package_spec"

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
