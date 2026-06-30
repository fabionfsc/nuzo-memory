# User Documentation Audit For 0.9.0

This audit records the public-onboarding correction completed while `0.8.1`
remained the current npm and GitHub release. Its central rule is simple: normal
installation pages document capabilities available in the current public
artifact, not capabilities that exist only on `main`.

## Reviewed Surfaces

| Surface | Audience | Result |
| --- | --- | --- |
| Root README | First-time user | Separate Codex, Claude Code, CLI, and generic MCP paths; add a cross-session first-success test. |
| Documentation homepage | First-time user | Present copyable current-release commands and lead to the memory loop. |
| Getting Started | First-time user | Add complete host trust, verification, CLI, and MCP paths. |
| Fresh installation | First-time user | Remove source-build prerequisites and use installed-package commands with fake data. |
| Local CLI | CLI user | Keep public-release commands and move contributor mechanics out of the user flow. |
| Codex and Claude Code guides | Host user | Keep direct marketplace installation, trust, verification, update, removal, and fallback steps. |
| `@nuzo/memory` npm README | npm user | Include complete Codex, Claude Code, CLI, MCP, and cross-session verification paths. |
| Legacy npm READMEs | Existing package user | Identify `@nuzo/memory` as the replacement and `0.9.0` as the final planned release. |
| Runtime support | Package user | Distinguish retrying a public npm install from contributor-only `npm ci`. |
| Site navigation | Every reader | Keep installation and use first; group release, benchmark, and historical evidence under Maintainer Guide. |

## Release Boundary

The `0.8.1` package exposes the `nuzo memory` command group, including capture,
recall, audit, import/export, and optional semantic operations. It does not
expose the host bootstrap or recovery commands implemented later on `main`.

Therefore, current user entry points do not present these commands:

```text
nuzo setup
nuzo update
nuzo memory integrity
nuzo memory backup
nuzo memory restore
```

When release metadata reaches `0.9.0`, the documentation contract requires the
primary entry points and npm README to add the released host-bootstrap journey.
Until then, implementation status remains in the changelog, release goals, and
maintainer documentation rather than the copyable current-install path.

## Package Lifecycle

`@nuzo/memory` is the only runtime package recommended for new npm installs.
`@nuzo/memory-cli` and `@nuzo/mcp-server` receive a final aligned `0.9.0`
release for migration compatibility. After that release passes published
validation, every existing version of both transition packages is marked
deprecated on npm with guidance to migrate to `@nuzo/memory`.

The packaging gate rejects accidental legacy staging after `0.9.0`. The
deprecation itself remains a post-publication npm metadata action and must not
run during development or release rehearsal.

## Automated Contracts

`npm run docs:check` now validates:

- release versions across public entry points;
- absence or required presence of version-gated setup and recovery commands;
- MCP tool count and names against the runtime tool contract;
- unified package recommendations and legacy package migration language;
- supported Node.js lines in first-use documentation;
- separation of maintainer evidence from primary install navigation.

CI and GitHub Pages run this check before building the MkDocs site. npm staging
also validates that the packaged READMEs contain the intended onboarding and
legacy lifecycle language.

## Validation Evidence

The audit uses an isolated installation of `@nuzo/memory@0.8.1` to inspect
`nuzo --help` and `nuzo memory --help` without allowing a workspace binary to
shadow the published package. Repository validation also covers strict MkDocs,
release-state consistency, generated npm artifacts, and host plugin smokes.

External-link crawling and broader prose terminology checks remain tracked by
[#196](https://github.com/fabionfsc/nuzo-memory/issues/196). They are ongoing
hardening, not a reason to mix unreleased commands into current onboarding.
