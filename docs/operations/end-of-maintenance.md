# End Of Maintenance

Nuzo `1.2.0` is the final planned upstream release. After its GitHub, npm, MCP
Registry, and security-advisory publication checks are complete, the source
repository is archived and becomes read-only.

## What Remains Available

- the tagged `v1.2.0` source and GitHub Release;
- `@nuzo/memory`, `@nuzo/memory-core`, and `@nuzo/memory-mcp` on npm;
- the `io.github.fabionfsc/nuzo-memory` MCP Registry entry;
- the static documentation and historical release evidence;
- the Apache-2.0 license, which permits downstream forks.

The active npm packages and MCP Registry entry are left available and are not
deprecated merely because maintenance ended. Retired transition packages keep
their existing migration deprecation notices.

## What Is Not Promised

There is no ongoing upstream commitment for:

- security patches or vulnerability response;
- dependency, Node.js, npm, operating-system, Codex, Claude Code, or MCP
  compatibility updates;
- issue triage, pull-request review, support, or release cadence;
- new features such as sync, encryption, UI, automated governance, or remote
  services.

The release records the tested Node.js 22 and 24 matrix at publication time.
That evidence is not a guarantee that future runtimes or hosts will remain
compatible.

## Guidance For Users

Pin `1.2.0` rather than depending on an open version range. Keep backups and
JSON exports of important stores, run `nuzo memory integrity` before and after
environment changes, and treat all stored memory as sensitive local data.

If continued maintenance is required, migrate to a maintained alternative or
fork the project. A fork should restore dependency and security monitoring,
revalidate native SQLite builds on every supported platform, keep the public
MCP schemas compatible or version breaking changes, and preserve explicit
confirmation for inferred writes.

Do not publish real stores, exports, credentials, or private host data when
requesting help from third parties.

## Deferred Work Disposition

The final audit deliberately does not add optional encrypted stores, automatic
relation mutation, stable topic-key upserts, or capture-confirmation tokens.
The encryption and confirmation decisions include explicit threat models,
option comparisons, and executable confirmation-binding evidence rather than
being deferred as an implied roadmap. The release does include
benchmark-proven relation-query batching, a bounded read-only governance
report, and explicit backed-up project-scope rehoming. Existing explicit export/import,
backup/restore, relation, challenge, inspection, and scope controls remain the
supported `1.2.0` workflows. These omissions are documented product boundaries,
not commitments for a future Nuzo release.
