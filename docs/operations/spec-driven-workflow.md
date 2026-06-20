# Specification-Driven Workflow

Nuzo uses a lightweight specification-first workflow for changes that are
expensive to reverse, cross package boundaries, or alter user-visible behavior.

The workflow is inspired by specification-driven development, including
GitHub Spec Kit, but does not require a separate CLI, generated scaffold, or
agent-specific commands. Nuzo's existing documentation and GitHub Issues
remain the sources of truth.

## When To Write A Proposal

Write a proposal before implementation when a change:

- adds or changes a public CLI command, MCP tool, export format, or config key;
- changes storage, migrations, authorization, privacy, or destructive behavior;
- crosses core, CLI, MCP, and host plugin boundaries;
- introduces a new optional subsystem such as capture automation, encryption,
  sync, embeddings, or a management UI;
- has meaningful alternatives or migration risk;
- is expected to span multiple pull requests.

A narrow bug fix, dependency update, documentation correction, or internal
refactor normally needs only a focused Issue with acceptance criteria.

## Source Of Truth Map

| Artifact | Owns | Does not own |
| --- | --- | --- |
| Change proposal | Problem, users, outcomes, constraints, alternatives, risks, validation evidence | Long-term contract text or task status |
| `docs/spec/` | Public memory, CLI, MCP, init, and versioning contracts | Implementation sequencing |
| `docs/adr/` | Durable architecture decisions and their consequences | Day-to-day progress |
| GitHub Issue | Tasks, ownership, acceptance criteria, status, and links | Canonical product or architecture documentation |
| Pull request | Reviewed implementation and validation evidence | Roadmap direction |

Do not copy the same requirements into every artifact. Link to the
authoritative document and record only the detail needed for the artifact's
role.

## Workflow

### 1. Specify The Outcome

Open an Architecture Proposal Issue and describe:

- the problem and affected users;
- observable outcomes and explicit non-goals;
- privacy, safety, compatibility, and local-first constraints;
- acceptance criteria that can be verified.

Keep the proposal independent from a preferred implementation until the
problem and constraints are clear.

### 2. Resolve Ambiguity

Identify unanswered questions before coding. Important ambiguity includes:

- who can read or write the affected memory;
- whether behavior is automatic, suggested, or explicitly invoked;
- what data is persisted and audited;
- how existing data or clients migrate;
- which hosts and Node.js versions must behave consistently;
- what failure and recovery look like.

If an unanswered question changes the public contract or safety boundary, do
not treat it as an implementation detail.

### 3. Plan By Boundary

Map the work to existing ownership boundaries:

```text
docs/spec -> public contract
docs/adr -> durable decision, when needed
packages/core -> memory behavior and policy
packages/cli -> command and terminal behavior
packages/mcp-server -> tool schema and transport mapping
packages/*-plugin -> thin host packaging
tests/docs/workflows -> evidence
```

List dependencies, migration steps, rollout order, and validation commands.
Prefer a sequence that keeps each commit reviewable and leaves the repository
in a valid state.

### 4. Create Executable Tasks

Use the proposal Issue as the execution tracker. Tasks should name concrete
artifacts or behaviors and finish with measurable acceptance criteria.

Split work into additional Issues only when tasks can be assigned, reviewed,
or released independently. Link child Issues back to the proposal.

### 5. Implement Against The Specification

Update public contracts before or alongside implementation. Add an ADR before
committing to an irreversible or hard-to-change architecture decision.

If implementation reveals that the specification is wrong, revise the
specification and explain the change in the Issue or pull request. Do not let
the code silently become the only description of behavior.

### 6. Verify And Close

Run the validation gates required by `AGENTS.md` and attach relevant evidence
to the Issue or pull request. Before closing:

- acceptance criteria are demonstrably satisfied;
- contract docs and examples match runtime behavior;
- migrations and compatibility paths are tested when relevant;
- generated artifacts, credentials, and runtime memories are absent from Git;
- roadmap and README claims are updated when project status changed.

## Proposal Template

Use the Architecture Proposal Issue form or this outline:

```markdown
## Problem

## Users And Scenarios

## Outcomes

## Non-Goals

## Constraints

## Public Contract Impact

## Architecture And Boundaries

## Alternatives

## Risks And Recovery

## Validation Plan

## Tasks

## Acceptance Criteria
```

## Relationship To GitHub Spec Kit

[GitHub Spec Kit](https://github.com/github/spec-kit) is a useful reference
for separating specification, planning, task breakdown, and implementation.
Nuzo adopts that discipline without making Spec Kit part of the product or
contributor toolchain.

This keeps the workflow portable across Codex, Claude Code, other agents, and
human contributors while avoiding generated process files that can drift from
Nuzo's existing contracts.
