# Changelog

All notable changes to Nuzo will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning after the first public release.

## [Unreleased]

### Added

- Local-first memory core backed by SQLite and FTS.
- Local CLI commands for init, remember, recall, list, update, forget, export, import, and doctor.
- MCP server exposing the Nuzo memory tool contract.
- Codex and Claude Code plugin wrapper scaffolds.
- MkDocs documentation site and GitHub Pages publishing.
- GitHub Issues workflow, labels, milestones, and issue templates.

### Changed

- Public docs now treat Nuzo as host-neutral across Codex, Claude Code, and MCP-compatible agents.

### Fixed

- CLI `memory forget` now accepts the documented `--archive` flag and rejects conflicting `--archive --delete` usage.

