# npm Publishing

Nuzo's host plugins resolve the shared runtime from:

```text
@nuzo/mcp-server
```

The MCP package depends on:

```text
@nuzo/memory-core
```

Both packages use the same version and must be released together.

## Scope Ownership

The preferred public scope is `@nuzo`.

An npm organization named `nuzo` must exist and the release maintainer must
have publishing access before the first release. An `E404` from `npm view`
only confirms that a package is not currently public; it does not prove that
the organization scope is available or owned by the project.

Confirm interactively:

```bash
npm login
npm whoami
npm org ls nuzo
```

Do not change public package names until the scope decision is durable. Package
names become part of the public API after release.

## Source Protection

The source workspace packages remain:

```json
{
  "private": true
}
```

Do not run `npm publish` from `packages/core` or `packages/mcp-server`.

Generate publish candidates instead:

```bash
npm run package:npm
```

This creates ignored staging directories and tarballs under:

```text
build/npm/
├── packages/
│   ├── memory-core/
│   └── mcp-server/
└── tarballs/
```

The staging process:

- removes `private` only from generated package metadata;
- removes development scripts and dependencies;
- pins the MCP server to the exact core version;
- copies runtime output, README, and Apache-2.0 license;
- rejects tests, source files, databases, exports, secrets, and environment files.

## Validation

Run:

```bash
npm run validate:npm
```

The validation:

1. rebuilds from clean `dist` directories;
2. creates both tarballs with `npm pack`;
3. installs both tarballs into a temporary project;
4. confirms package versions match;
5. starts the installed `nuzo-mcp-server` binary against a temporary store.

The command does not publish anything.

## First Publication

Do not publish version `0.0.0`. Follow the release checklist and move all Nuzo
packages and plugin manifests to the first release version together.

Publish in dependency order:

```bash
cd build/npm/packages/memory-core
npm publish --access public

cd ../mcp-server
npm publish --access public
```

Verify before distributing host plugins:

```bash
npm view @nuzo/memory-core@<version> version
npm view @nuzo/mcp-server@<version> version
npx --yes @nuzo/mcp-server@<version>
```

The first publication should be performed by an authenticated maintainer with
2FA. After both packages exist, configure npm trusted publishing for the
release workflow so routine releases use GitHub Actions OIDC instead of a
long-lived token.

## Credentials

Never commit:

- `.npmrc` containing credentials;
- `NODE_AUTH_TOKEN`;
- npm access tokens;
- 2FA recovery codes;
- npm debug logs containing authentication context.

If a token is used temporarily:

1. create a granular token with the narrowest package access and expiration;
2. store it only in the approved secret store;
3. revoke it immediately if exposed or no longer required;
4. remove local credential files after use.

Prefer trusted publishing once the initial packages and publisher relationship
exist.

## Recovery

If publication fails:

1. Stop before retrying with broader credentials.
2. Check `npm whoami` and organization membership.
3. Confirm the target version does not already exist.
4. Re-run `npm run validate:npm`.
5. Inspect the generated staging package, not the source workspace package.
6. If credentials may have leaked, revoke them before further work.

Never delete or rewrite a published version to repair a failed release. Fix the
problem and publish a new SemVer version.

## Official References

- [Creating an npm organization](https://docs.npmjs.com/creating-an-organization/)
- [Publishing scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
- [Trusted publishing with OIDC](https://docs.npmjs.com/trusted-publishers/)
- [npm access tokens](https://docs.npmjs.com/about-access-tokens/)
