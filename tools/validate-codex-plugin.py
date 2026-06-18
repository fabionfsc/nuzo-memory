#!/usr/bin/env python3
import json
import pathlib
import re
import sys


def fail(message: str) -> None:
    print(f"plugin validation failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_json(path: pathlib.Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"{path} is not valid JSON: {error}")


def main() -> None:
    if len(sys.argv) != 2:
        fail("usage: validate-codex-plugin.py <plugin-root>")

    root = pathlib.Path(sys.argv[1]).resolve()
    manifest_path = root / ".codex-plugin" / "plugin.json"
    if not manifest_path.exists():
        fail(".codex-plugin/plugin.json is missing")

    manifest = load_json(manifest_path)
    if not isinstance(manifest, dict):
        fail("plugin.json must contain a JSON object")
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
        mcp_config_path = root / mcp_path[2:]
        if not mcp_config_path.exists():
            fail(f"mcpServers target does not exist: {mcp_path}")
        mcp_config = load_json(mcp_config_path)
        if not isinstance(mcp_config, dict):
            fail("mcpServers target must contain a JSON object")
        servers = mcp_config.get("mcpServers")
        if not isinstance(servers, dict) or not servers:
            fail("mcpServers target must define at least one MCP server")
        for server_name, server in servers.items():
            if not isinstance(server_name, str) or not server_name:
                fail("MCP server names must be non-empty strings")
            if not isinstance(server, dict):
                fail(f"MCP server '{server_name}' must be a JSON object")
            command = server.get("command")
            if not isinstance(command, str) or not command:
                fail(f"MCP server '{server_name}' must define a command")
            args = server.get("args", [])
            if not isinstance(args, list) or not all(isinstance(arg, str) for arg in args):
                fail(f"MCP server '{server_name}' args must be an array of strings")
        nuzo_server = servers.get("nuzo")
        if not isinstance(nuzo_server, dict):
            fail("mcpServers target must define a 'nuzo' server")
        if nuzo_server.get("command") != "node":
            fail("nuzo MCP server must run with node")
        if "../mcp-server/dist/index.js" not in nuzo_server.get("args", []):
            fail("nuzo MCP server must point at ../mcp-server/dist/index.js")

    print(f"plugin validation passed: {root}")


if __name__ == "__main__":
    main()
