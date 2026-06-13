#!/usr/bin/env python3
import json
import pathlib
import re
import sys


def fail(message: str) -> None:
    print(f"plugin validation failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if len(sys.argv) != 2:
        fail("usage: validate-codex-plugin.py <plugin-root>")

    root = pathlib.Path(sys.argv[1]).resolve()
    manifest_path = root / ".codex-plugin" / "plugin.json"
    if not manifest_path.exists():
        fail(".codex-plugin/plugin.json is missing")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    required = ["name", "version", "description", "author", "license", "interface"]
    for key in required:
        if key not in manifest:
            fail(f"plugin.json missing required field: {key}")

    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", manifest["name"]):
        fail("plugin name must be kebab-case and <= 64 chars")
    if not re.fullmatch(r"\d+\.\d+\.\d+", manifest["version"]):
        fail("plugin version must be strict semver")
    if manifest["license"] != "Apache-2.0":
        fail("plugin license must be Apache-2.0")
    if "[TODO:" in json.dumps(manifest):
        fail("plugin.json contains TODO placeholder")

    interface = manifest["interface"]
    for key in ["displayName", "shortDescription", "longDescription", "developerName", "category"]:
        if key not in interface:
            fail(f"plugin interface missing required field: {key}")

    mcp_path = manifest.get("mcpServers")
    if mcp_path:
        if not isinstance(mcp_path, str) or not mcp_path.startswith("./"):
            fail("mcpServers must be a relative path starting with ./")
        if not (root / mcp_path[2:]).exists():
            fail(f"mcpServers target does not exist: {mcp_path}")

    print(f"plugin validation passed: {root}")


if __name__ == "__main__":
    main()
