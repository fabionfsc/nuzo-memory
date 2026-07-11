# Public Launch Playbook

This is the executable adoption checklist for Nuzo `1.0.0`. It coordinates a
public launch; it does not authorize a new npm release, telemetry, paid
promotion, or posting from an operator's external accounts.

## Canonical Links

- Repository: <https://github.com/fabionfsc/nuzo-memory>
- Documentation: <https://nuzo.com.br/>
- 60-second demo: <https://nuzo.com.br/getting-started/sixty-second-demo/>
- Current release: <https://github.com/fabionfsc/nuzo-memory/releases/tag/v1.0.0>
- npm package: <https://www.npmjs.com/package/@nuzo/memory>
- Feedback: <https://github.com/fabionfsc/nuzo-memory/issues/new/choose>

Use these canonical destinations instead of creating campaign-specific install
instructions that can drift.

## Readiness Gate

- [ ] Install `@nuzo/memory@1.0.0` into a clean temporary npm prefix.
- [ ] Run the complete 60-second demo against that installed package.
- [ ] Verify a confirmed memory across two fresh Codex sessions.
- [ ] Verify a confirmed memory across two fresh Claude Code sessions.
- [ ] Confirm README, docs home, npm README, and release notes agree on the
      version, package, Node support, tool count, and write boundary.
- [ ] Confirm the docs site and all canonical links return successfully.
- [ ] Confirm GitHub Bug, Installation Feedback, Feature, Documentation, and
      Architecture forms are available.
- [ ] Confirm no example contains real memory, credentials, identifiers, or
      private operator data.

Record evidence in a focused issue before marking this gate complete.

Local evidence collected on 2026-07-11: the CLI demo completed against a clean
temporary installation of public package `@nuzo/memory@1.0.0` using Node.js 22,
including init, remember, recall, list, audit, and cleanup. Host-session checks
remain separate manual gates because they require an interactive host.

## Distribution Targets

Each target should have its own issue because submission rules and moderation
can change independently.

Initial execution issues:

- [#314](https://github.com/fabionfsc/nuzo-memory/issues/314) evaluates MCP
  directories and records eligibility evidence;
- [#315](https://github.com/fabionfsc/nuzo-memory/issues/315) prepares sourced
  public launch posts and tracks corrections;
- [#316](https://github.com/fabionfsc/nuzo-memory/issues/316) runs the
  supported-host clean-install feedback pass.

| Target | Required evidence | Completion evidence |
| --- | --- | --- |
| MCP directories or registries | Confirm the current official submission path and whether a local stdio server is eligible. | Public listing URL or a documented not-applicable decision. |
| Curated agent-tool lists | Read contribution rules, use the canonical one-sentence description, and disclose project ownership where requested. | Merged contribution or declined/closed link. |
| Codex and Claude Code communities | Reproduce installation on the named host; do not imply host endorsement. | Public post URL and any correction follow-up. |
| Developer communities | Lead with the problem and demo, not unsupported benchmark or adoption claims. | Public post URL and summarized actionable feedback. |
| Project release channels | Reuse the existing `v1.0.0` release; do not retag or republish merely for launch copy. | Verified release and npm links. |

## Launch Narrative

Use this compact structure:

1. **Problem:** coding agents repeatedly lose useful project context, while
   opaque automatic memory weakens user control.
2. **Boundary:** Nuzo keeps confirmed memory local and inspectable; recall is
   read-only and inferred writes require confirmation.
3. **Proof:** install one npm package and run the disposable 60-second demo.
4. **Fit:** use Nuzo for cross-host, lifecycle-managed knowledge; keep durable
   repository rules in `AGENTS.md`.
5. **Ask:** report installation friction through the dedicated GitHub form.

Avoid “first,” “best,” “private,” or “secure” as absolute claims. Say exactly
which controls exist and what remains outside the product boundary.

## Feedback Loop

During a launch pass:

1. Triage new reports into installation, bug, feature, docs, or architecture.
2. Reproduce installation reports with fake data on a supported runtime.
3. Turn repeated friction into a focused issue with acceptance criteria.
4. Correct public documentation before repeating a workaround in comments.
5. Do not collect telemetry or copy private memories into issues.

The public [feedback guide](feedback.md) explains which form to use and what
safe diagnostic information to include.
