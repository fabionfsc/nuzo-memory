#!/usr/bin/env python3
import json
import pathlib
import re
import sys


def fail(message: str) -> None:
    print(f"claude code plugin validation failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_json(path: pathlib.Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"{path} is not valid JSON: {error}")


def main() -> None:
    if len(sys.argv) != 2:
        fail("usage: validate-claude-code-plugin.py <plugin-root>")

    root = pathlib.Path(sys.argv[1]).resolve()
    manifest_path = root / ".claude-plugin" / "plugin.json"
    if not manifest_path.exists():
        fail(".claude-plugin/plugin.json is missing")

    manifest = load_json(manifest_path)
    required = ["name", "version", "description", "author", "license", "mcpServers"]
    for key in required:
        if key not in manifest:
            fail(f"plugin.json missing required field: {key}")

    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", manifest["name"]):
        fail("plugin name must be kebab-case and <= 64 chars")
    if manifest["name"] != "nuzo":
        fail("plugin name must remain host-neutral: nuzo")
    if not re.fullmatch(r"\d+\.\d+\.\d+", manifest["version"]):
        fail("plugin version must be strict semver")
    if manifest["license"] != "Apache-2.0":
        fail("plugin license must be Apache-2.0")
    if "[TODO:" in json.dumps(manifest):
        fail("plugin.json contains TODO placeholder")

    mcp_path = manifest["mcpServers"]
    if not isinstance(mcp_path, str) or not mcp_path.startswith("./"):
        fail("mcpServers must be a relative path starting with ./")

    mcp_config_path = root / mcp_path[2:]
    if not mcp_config_path.exists():
        fail(f"mcpServers target does not exist: {mcp_path}")

    mcp_config = load_json(mcp_config_path)
    servers = mcp_config.get("mcpServers")
    if not isinstance(servers, dict):
        fail(".mcp.json must contain an mcpServers object")
    if "nuzo" not in servers:
        fail(".mcp.json must define an MCP server named nuzo")

    nuzo = servers["nuzo"]
    if nuzo.get("command") != "node":
        fail("nuzo MCP server command must be node")
    args = nuzo.get("args")
    if not isinstance(args, list) or not args:
        fail("nuzo MCP server must define args")
    if not any("mcp-server/dist/index.js" in str(arg) for arg in args):
        fail("nuzo MCP server args must point to packages/mcp-server/dist/index.js")

    skills_path = manifest.get("skills")
    if skills_path:
        if not isinstance(skills_path, str) or not skills_path.startswith("./"):
            fail("skills must be a relative path starting with ./")
        if not (root / skills_path[2:]).exists():
            fail(f"skills target does not exist: {skills_path}")

    print(f"claude code plugin validation passed: {root}")


if __name__ == "__main__":
    main()
