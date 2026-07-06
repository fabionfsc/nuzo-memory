# GitHub Pages

The documentation site is built with MkDocs Material and deployed by GitHub Actions.

## Domain

Primary domain:

```text
nuzo.com.br
```

The custom domain is declared in:

```text
docs/CNAME
```

MkDocs copies that file into the built `site/` directory during deployment.

## Local Preview

Install dependencies:

```bash
pip install -r requirements-docs.txt
```

Run the docs server:

```bash
mkdocs serve
```

Build strictly:

```bash
mkdocs build --strict
```

## GitHub Repository Settings

After the repository is created on GitHub:

1. Open repository settings.
2. Go to Pages.
3. Set source to GitHub Actions.
4. Confirm the custom domain is `nuzo.com.br`.
5. Enable Enforce HTTPS after DNS is valid.

## DNS

For an apex domain, configure GitHub Pages DNS records.

Recommended records:

```text
A     @     185.199.108.153
A     @     185.199.109.153
A     @     185.199.110.153
A     @     185.199.111.153
AAAA  @     2606:50c0:8000::153
AAAA  @     2606:50c0:8001::153
AAAA  @     2606:50c0:8002::153
AAAA  @     2606:50c0:8003::153
```

Optional `www` redirect:

```text
CNAME www nuzo.com.br
```

## Deployment

The workflow is:

```text
.github/workflows/pages.yml
```

It runs on manual dispatch and on pushes to `main` that change site-relevant
files. Newer Pages runs cancel obsolete queued deployments so rapid main merges
do not publish stale artifacts.

## Installer Asset

The site serves the npm-backed one-line installer from:

```text
https://nuzo.com.br/install.sh
```

The source file is:

```text
docs/install.sh
```

The installer checks Node.js and npm, installs `@nuzo/memory` with npm, validates
`nuzo --version`, and stops before host configuration. It does not install
Node.js, npm, or other system packages automatically; missing prerequisites
fail with guidance. Users still run `nuzo setup` explicitly to review Codex or
Claude Code changes.

Before installation, the installer resolves the npm package, downloads the
package tarball, verifies the tarball against npm integrity metadata, and then
installs the verified tarball globally.

Validate installer behavior locally with:

```bash
npm run smoke:installer
```

The smoke gate uses ephemeral Docker containers. It combines fake npm/Nuzo
commands for deterministic control-flow checks with real npm installs inside
Node containers for the current public package. It does not publish packages or
configure host plugins.
