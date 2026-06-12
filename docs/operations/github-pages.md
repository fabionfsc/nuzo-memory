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

It runs on pushes to `main` and manual dispatch.
