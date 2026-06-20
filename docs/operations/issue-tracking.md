# Issue Tracking

GitHub Issues are Nuzo's execution tracker.

Docs and roadmap explain direction. Issues should describe work that can be assigned, reviewed, and closed.

## Labels

Use three label groups together when possible:

- `area:*` for ownership;
- `type:*` for the kind of work;
- `priority:*` for sequencing.

Current area labels:

- `area:core`
- `area:cli`
- `area:mcp`
- `area:codex`
- `area:claude-code`
- `area:docs`
- `area:release`

Current type labels:

- `type:feature`
- `type:bug`
- `type:docs`
- `type:architecture`

Current priority labels:

- `priority:p0`
- `priority:p1`
- `priority:p2`

Use `status:blocked` only when an issue has a concrete external blocker.

## Milestones

Current milestones:

- `MVP`
- `Host Plugins`
- `Lifecycle Hooks`
- `Public Release`

Milestones should stay small enough to guide execution. Do not use them as permanent categories.

## Issue Quality

Good issues include:

- a clear goal;
- relevant package or docs boundaries;
- concrete tasks;
- acceptance criteria;
- links to docs or prior decisions when useful.

Avoid issues that only say "improve docs" or "make plugin better". Convert them into a specific deliverable before starting work.

Use the Architecture Proposal form for substantial, cross-boundary, or
hard-to-reverse changes. Follow `spec-driven-workflow.md` to separate the
proposal, public contract, durable decisions, and executable task status.

## Periodic Issue Hunting

Run issue hunting after meaningful changes and before larger next-step work.

Check:

- docs and README for stale product claims;
- roadmap status against implemented packages;
- CLI, MCP, and plugin commands shown in docs against real commands;
- generated artifacts or runtime memory accidentally staged;
- GitHub Issues for duplicates or completed work that should be closed;
- GitHub Pages and release workflow status when public docs change;
- repository controls such as branch protection, Dependabot alerts and security
  updates, CodeQL, secret scanning, and push protection;
- tests and validation gaps around recently changed behavior.

Small safe fixes can be handled immediately. Larger work should become a focused GitHub Issue with labels, milestone, concrete tasks, and acceptance criteria.

## Security

Issues must not include:

- runtime memory files;
- real memory exports;
- API tokens;
- credentials;
- cookies;
- private keys;
- private user data.

Use fake data for examples and reproduction steps.

## Pull Request Governance

Routine changes must use a branch and pull request. Branch protection applies
to administrators and requires the Node.js 22, Node.js 24, documentation, and
CodeQL checks to pass against the current `main`.

Nuzo does not require approving reviews while the repository has one primary
maintainer. The pull request still provides a reviewable diff, check history,
discussion surface, and atomic squash-merge boundary.

If branch protection must be relaxed for repository recovery, open or update a
focused Issue with the reason, restore protection immediately after recovery,
and attach validation evidence for the resulting `main`.
