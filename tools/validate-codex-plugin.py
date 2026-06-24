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
    release = False
    args = sys.argv[1:]
    if args and args[0] == "--release":
        release = True
        args = args[1:]
    if len(args) != 1:
        fail("usage: validate-codex-plugin.py [--release] <plugin-root>")

    root = pathlib.Path(args[0]).resolve()
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
        validate_nuzo_server(nuzo_server, manifest["version"], release)

    validate_nuzo_skill(root / "skills" / "nuzo-memory" / "SKILL.md")

    print(f"plugin validation passed: {root}")


def validate_nuzo_server(server: dict, version: str, release: bool) -> None:
    args = server.get("args", [])
    if release:
        if server.get("command") != "npm":
            fail("release nuzo MCP server must run with npm")
        if args != ["exec", "--yes", f"--package=@nuzo/mcp-server@{version}", "--", "nuzo-mcp-server"]:
            fail("release nuzo MCP server must pin @nuzo/mcp-server to the plugin version and explicit binary")
        if any(".." in arg or "/mcp-server/" in arg for arg in args):
            fail("release nuzo MCP server must not reference monorepo paths")
        return

    if server.get("command") != "node":
        fail("development nuzo MCP server must run with node")
    if args != ["../mcp-server/dist/index.js"]:
        fail("development nuzo MCP server must point at ../mcp-server/dist/index.js")


def validate_nuzo_skill(path: pathlib.Path) -> None:
    if not path.exists():
        fail("skills/nuzo-memory/SKILL.md is missing")

    content = path.read_text(encoding="utf-8")
    frontmatter = re.match(r"\A---\n(.*?)\n---\n", content, re.DOTALL)
    if not frontmatter:
        fail("Nuzo skill must contain YAML frontmatter")
    metadata = frontmatter.group(1)
    if not re.search(r"^name:\s*nuzo-memory$", metadata, re.MULTILINE):
        fail("Nuzo skill name must be nuzo-memory")
    if not re.search(r"^description:\s*\S.+$", metadata, re.MULTILINE):
        fail("Nuzo skill must contain a non-empty description")
    if "[TODO:" in content:
        fail("Nuzo skill contains a TODO placeholder")

    required_guidance = [
        "only after the user confirms or",
        "Explicit Save Requests",
        "memory.suggest_capture` with content, kind, scope, tags, source",
        "If the user rejects the draft, do not write memory",
        "coloca isso na memoria do Nuzo",
        "Do not silently save inferred memories.",
        "Never store secrets",
        "Codex built-in generated memories",
        "memory.recall_hook",
        "memory.forget_many",
    ]
    for guidance in required_guidance:
        if guidance not in content:
            fail(f"Nuzo skill missing required guidance: {guidance}")


if __name__ == "__main__":
    main()
