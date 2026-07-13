# MCP Registry Publication

Nuzo's official MCP Registry definition uses one local stdio listing under:

```text
io.github.fabionfsc/nuzo-memory
```

Publication happens only after the matching npm release exists. The Registry
is a metadata directory, not an artifact host or endorsement.
Nuzo remains local-first: the listed package runs on the user's machine,
stores SQLite data locally, makes no network calls by default, and requires
explicit writes.

## Distribution Boundary

The Registry package is:

```text
@nuzo/memory-mcp
```

It has one npm bin, `memory-mcp`, so `npx` can select the executable without a
heuristic or extra argument. Its staged files are copied from the shared
`packages/mcp-server` build and depend on the exact matching
`@nuzo/memory-core` version. It owns no storage, policy, recall, or tool logic.

Normal users should continue to install `@nuzo/memory`. The dedicated package
exists because the unified package intentionally exposes separate CLI, MCP,
and hook binaries, while Registry npm execution requires an unambiguous
entrypoint.

## Source Of Truth

The tracked root `server.json` contains:

- the GitHub-authenticated Registry name;
- the stable GitHub repository ID, which survives repository renames;
- the exact Nuzo and npm package version;
- one public npm package over stdio;
- optional, content-free local runtime variables;
- no remote endpoint, secret, telemetry field, or adoption claim.

The npm package's `mcpName` must exactly match `server.json.name`. The npm
artifact must be public before Registry publication; schema validation alone
does not prove that ownership check will pass.

## Validation

Run the local contract check:

```bash
npm run registry:check
```

Run the official publisher validation:

```bash
npm run registry:validate
```

The second command downloads the reviewed official `mcp-publisher` 1.7.9
Linux amd64 archive, verifies its pinned SHA-256 digest, and validates
`server.json`. The downloaded binary stays under ignored `build/tools/`.

Also run:

```bash
npm run validate:npm
```

Starting with `1.1.0`, npm artifact validation installs the generated
`@nuzo/memory-mcp` tarball, confirms its one-bin and `mcpName` contracts, and
connects an SDK client to that installed entrypoint.

## Release Order

For `1.1.0` and later:

1. run the npm release workflow with `publish=false` and review all three
   package candidates;
2. run it with `publish=true` to publish `@nuzo/memory-core` and
   `@nuzo/memory`; the policy deliberately defers the brand-new Registry
   package at `1.1.0`;
3. after core `1.1.0` is public, use an authenticated npm maintainer session to
   perform the one-time first publication of the reviewed
   `build/npm/packages/memory-mcp/` candidate;
4. configure trusted publishing for `@nuzo/memory-mcp` with the same
   repository, workflow, environment, and allowed `npm publish` action as the
   other active packages; later releases then use OIDC normally;
5. verify the exact public `@nuzo/memory-mcp` version contains the matching
   `mcpName` and starts through `npx`;
6. authenticate `mcp-publisher` with GitHub as `fabionfsc`;
7. publish the exact reviewed `server.json`;
8. query the Registry API for the exact name/version and record the public
   evidence on issue #314.

Do not publish `server.json` before the npm artifact exists. Do not use
anonymous login against the public Registry, add a remote transport, or imply
that listing means MCP, GitHub, Codex, or Claude endorsement.

npm requires a package to exist before trusted publishing or staged publishing
can be configured. Do not add a long-lived npm token to the workflow to bypass
that first-publication boundary. The authenticated bootstrap is a one-version
exception; configure OIDC immediately afterward.

The one-time bootstrap command, after `npm login`, 2FA readiness, target
availability checks, and `npm run package:npm`, is:

```bash
npm publish build/npm/packages/memory-mcp --access public
```

Verify it before configuring trusted publishing or touching the MCP Registry:

```bash
npm view @nuzo/memory-mcp@1.1.0 mcpName bin version --json
npm run smoke:published:registry
```

The smoke verifies public npm metadata, then uses the direct
`npx --yes @nuzo/memory-mcp@1.1.0` heuristic and opens fresh MCP sessions
against an isolated fake store.

After `mcp-publisher publish` succeeds, verify the exact active Registry API
record and its official publication metadata:

```bash
npm run registry:verify -- 1.1.0
```

This read-only check requires the response to match the tracked name, version,
schema, repository, npm package, and stdio transport. It also requires the
official status to be active and the version to be latest. Passing the expected
version explicitly keeps the outbound lookup independent from local file data;
the response must still match `server.json` exactly.

## Authentication

Interactive publication uses:

```bash
build/tools/mcp-publisher login github
build/tools/mcp-publisher publish server.json
```

GitHub authentication grants the personal `io.github.fabionfsc/*` namespace.
Tokens are stored by the publisher outside the repository. Log out after a
one-off local publication if the credential is not intended to remain on the
machine:

```bash
build/tools/mcp-publisher logout
```

GitHub Actions OIDC can replace interactive login in a future automation
slice. Keep initial Registry publication manual until the package identity and
listing have been observed successfully in production.

## Preview Boundary

The official Registry is currently preview software. Schema versions,
publisher releases, API behavior, or stored preview data may change. Recheck
the official quickstart, package-type requirements, authentication rules, and
current schema before every publication. Update the pinned publisher and
checksum through review, never by following `latest` during CI.

## Official References

- [Registry publishing quickstart](https://modelcontextprotocol.io/registry/quickstart)
- [Supported package types](https://modelcontextprotocol.io/registry/package-types)
- [Registry authentication](https://modelcontextprotocol.io/registry/authentication)
- [Official Registry repository](https://github.com/modelcontextprotocol/registry)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers)
- [npm staged publishing](https://docs.npmjs.com/staged-publishing)
