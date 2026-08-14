#!/bin/sh
set -eu

version=1.8.1
archive=mcp-publisher_linux_amd64.tar.gz
checksum=a06c9096dcb9727c13555b6be26c7effa707b01f06a4c561ba7a3635443cf2cc
destination=build/tools
url="https://github.com/modelcontextprotocol/registry/releases/download/v${version}/${archive}"

mkdir -p "$destination"
curl --fail --silent --show-error --location "$url" --output "$destination/$archive"
printf '%s  %s\n' "$checksum" "$destination/$archive" | sha256sum --check --status
tar -xzf "$destination/$archive" -C "$destination" mcp-publisher
chmod 0755 "$destination/mcp-publisher"
"$destination/mcp-publisher" --version
