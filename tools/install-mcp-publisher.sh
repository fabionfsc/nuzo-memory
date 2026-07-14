#!/bin/sh
set -eu

version=1.7.9
archive=mcp-publisher_linux_amd64.tar.gz
checksum=ab128162b0616090b47cf245afe0a23f3ef08936fdce19074f5ba0a4469281ac
destination=build/tools
url="https://github.com/modelcontextprotocol/registry/releases/download/v${version}/${archive}"

mkdir -p "$destination"
curl --fail --silent --show-error --location "$url" --output "$destination/$archive"
printf '%s  %s\n' "$checksum" "$destination/$archive" | sha256sum --check --status
tar -xzf "$destination/$archive" -C "$destination" mcp-publisher
chmod 0755 "$destination/mcp-publisher"
"$destination/mcp-publisher" --version
