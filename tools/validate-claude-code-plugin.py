#!/usr/bin/env python3
import json
import pathlib
import re
import sys


def fail(message: str) -> None:
    print(f"claude code plugin validation failed: {message}", file=sys.stderr)
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
        fail("usage: validate-claude-code-plugin.py [--release] <plugin-root>")

    root = pathlib.Path(args[0]).resolve()
    manifest_path = root / ".claude-plugin" / "plugin.json"
    if not manifest_path.exists():
        fail(".claude-plugin/plugin.json is missing")

    manifest = load_json(manifest_path)
    if not isinstance(manifest, dict):
        fail("plugin.json must contain a JSON object")
    required = ["name", "version", "description", "author", "license", "mcpServers"]
    for key in required:
        if key not in manifest:
            fail(f"plugin.json missing required field: {key}")

    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", manifest["name"]):
        fail("plugin name must be kebab-case and <= 64 chars")
    if manifest["name"] != "nuzo":
        fail("plugin name must remain host-neutral: nuzo")
    display_name = manifest.get("displayName")
    if display_name is not None and display_name != "Nuzo":
        fail("plugin displayName must remain Nuzo")
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
    if not isinstance(mcp_config, dict):
        fail(".mcp.json must contain a JSON object")
    servers = mcp_config.get("mcpServers")
    if not isinstance(servers, dict) or not servers:
        fail(".mcp.json must contain a non-empty mcpServers object")
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

    nuzo = servers.get("nuzo")
    if not isinstance(nuzo, dict):
        fail(".mcp.json must define an MCP server named nuzo")
    validate_nuzo_server(nuzo, manifest["version"], release)

    skills_path = manifest.get("skills")
    if skills_path:
        if not isinstance(skills_path, str) or not skills_path.startswith("./"):
            fail("skills must be a relative path starting with ./")
        if not (root / skills_path[2:]).exists():
            fail(f"skills target does not exist: {skills_path}")

    validate_nuzo_hooks(root / "hooks" / "hooks.json", manifest["version"], release)

    print(f"claude code plugin validation passed: {root}")


def validate_nuzo_server(server: dict, version: str, release: bool) -> None:
    args = server.get("args")
    if not isinstance(args, list) or not args:
        fail("nuzo MCP server must define args")

    if release:
        if server.get("command") != "npm":
            fail("release nuzo MCP server command must be npm")
        if args != ["exec", "--yes", f"--package=@nuzo/memory@{version}", "--", "nuzo-mcp-server"]:
            fail("release nuzo MCP server must pin @nuzo/memory to the plugin version and explicit binary")
        if server.get("cwd") != "${CLAUDE_PLUGIN_ROOT}":
            fail("release nuzo MCP server cwd must resolve through ${CLAUDE_PLUGIN_ROOT}")
        if server.get("env") != {"NUZO_PROJECT_ROOT": "${CLAUDE_PROJECT_DIR}"}:
            fail("release nuzo MCP server must pass ${CLAUDE_PROJECT_DIR} as NUZO_PROJECT_ROOT")
        if any(".." in arg or "/mcp-server/" in arg for arg in args):
            fail("release nuzo MCP server must not reference monorepo paths")
        return

    if server.get("command") != "node":
        fail("development nuzo MCP server command must be node")
    if args != ["${CLAUDE_PLUGIN_ROOT}/../mcp-server/dist/index.js"]:
        fail("development nuzo MCP server must point to the monorepo MCP build")


def validate_nuzo_hooks(path: pathlib.Path, version: str, release: bool) -> None:
    if not path.exists():
        fail("hooks/hooks.json is missing")
    config = load_json(path)
    hooks = config.get("hooks") if isinstance(config, dict) else None
    if not isinstance(hooks, dict):
        fail("hooks/hooks.json must define hooks")
    session = hooks.get("SessionStart")
    prompt = hooks.get("UserPromptSubmit")
    if not isinstance(session, list) or len(session) != 1:
        fail("hooks must define one SessionStart matcher")
    if session[0].get("matcher") != "startup|resume|clear|compact":
        fail("SessionStart must cover startup, resume, clear, and compact")
    if not isinstance(prompt, list) or len(prompt) != 1:
        fail("hooks must define one UserPromptSubmit matcher")
    commands = []
    for group in [session[0], prompt[0]]:
        handlers = group.get("hooks") if isinstance(group, dict) else None
        if not isinstance(handlers, list) or len(handlers) != 1:
            fail("each Nuzo lifecycle event must define one hook handler")
        handler = handlers[0]
        if handler.get("type") != "command" or handler.get("timeout") != 10:
            fail("Nuzo recall hooks must be bounded command hooks")
        commands.append(handler.get("command"))
    if commands[0] != commands[1]:
        fail("Nuzo lifecycle events must use the same hook runner")
    expected = (
        f"npm exec --yes --package=@nuzo/memory@{version} -- nuzo-memory-hook"
        if release
        else 'node "${CLAUDE_PLUGIN_ROOT}/../mcp-server/dist/host-hook-cli.js"'
    )
    if commands[0] != expected:
        fail("Nuzo hook runner must use the expected pinned release or local development command")
    serialized = json.dumps(config).lower()
    if "suggest_capture" in serialized or "memory.remember" in serialized:
        fail("lifecycle hook configuration must not contain capture or write paths")


if __name__ == "__main__":
    main()
