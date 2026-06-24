# Contributing

Nuzo is in early public development. Contributions should preserve the
project's main promise: local-first, auditable, user-controlled memory for
agents.

## Before Contributing

Read:

1. `README.md`
2. `docs/getting-started/index.md`
3. `docs/architecture/boundaries.md`
4. `docs/spec/tools.md`
5. `docs/operations/roadmap.md`
6. `docs/operations/spec-driven-workflow.md`

## Contribution Rules

- Keep business logic in future `packages/core`.
- Do not add runtime memory files to the repository.
- Do not add real credentials, personal memory, tokens, or private data to examples.
- Update documentation before or alongside public behavior changes.
- Keep MCP tool contracts stable and versioned.
- Prefer small, focused changes.
- Specify substantial, cross-boundary, or hard-to-reverse changes before
  implementation using the Architecture Proposal Issue form.

## Docs Validation

Install docs dependencies:

```bash
python3 -m venv .venv-docs
.venv-docs/bin/pip install -r requirements-docs.txt
```

Validate:

```bash
.venv-docs/bin/mkdocs build --strict
```

## TypeScript Validation

Install workspace dependencies:

```bash
npm install
```

Run:

```bash
npm run check
npm test
npm run build
```

## Pull Request Expectations

Routine changes must reach `main` through a pull request. Direct pushes are
blocked for maintainers and administrators.

Each PR should explain:

- what changed;
- why it changed;
- which docs or contracts were affected;
- how it was validated.

If a change affects storage, MCP tools, CLI commands, privacy defaults, or package boundaries, update the relevant document in `docs/`.

Nuzo currently requires passing Node.js 22, Node.js 24, documentation, and
CodeQL checks. A human approval is not required while the project has one
primary maintainer. Pull requests should use squash merge with an intentional
Conventional Commit subject.

Administrator protection may be disabled only for concrete repository
recovery. The maintainer must record the reason in a GitHub Issue, restore the
rule immediately, and validate the resulting `main`.
