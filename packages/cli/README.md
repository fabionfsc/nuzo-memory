# @nuzo/memory-cli

Legacy transition Nuzo CLI package.

Use the unified package instead:

```bash
npm install --global @nuzo/memory
```

`@nuzo/memory` includes the `nuzo` command, the `nuzo-mcp-server` binary, and
the `nuzo-memory-hook` lifecycle runner used by host plugins.

This package remains published during the transition window for existing users
and automation. New installs should use `@nuzo/memory`.
Version `0.9.0` is the planned final release of this transition package. After
`0.9.0` is published, all of its npm versions will be marked deprecated with
migration guidance to `@nuzo/memory`.

## Legacy Install

Existing users may retain this package while migrating. Do not use it for a
new installation.

```bash
npm install --global @nuzo/memory-cli
```

Documentation: https://nuzo.com.br/

License: Apache-2.0
