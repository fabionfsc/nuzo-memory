---
name: nuzo-memory
description: Use Nuzo MCP tools for local, auditable, portable memory in Codex when durable project context, preferences, decisions, instructions, or workflow notes should persist across sessions.
---

# Nuzo Memory

Use Nuzo as user-controlled memory. Treat Codex built-in generated memories as
a separate host feature; do not claim migration or access without an official
Codex API or export.

## Workflow

### Task-Start Recall

Plugin lifecycle hooks provide bounded read-only recall at session start and
alongside user prompts. If hook context is unavailable, call
`memory.recall_hook` before substantial work whenever prior project context,
user preferences, decisions, or recurring workflow notes may apply.

Recall is read-only. Do not create capture suggestions during task-start recall.
Use the recalled memories as context, but keep them separate from Codex built-in
generated memories.

### Explicit Save Requests

Treat an explicit save request as a request to start the confirmed Nuzo capture
flow. Do not treat it as permission for an invisible write.

Trigger this flow when the user asks to persist context in Nuzo, for example:

- "save this in Nuzo memory";
- "remember this for this project";
- "remember that I prefer concise status updates";
- "store this decision in Nuzo";
- "keep this for future sessions";
- "save this preference in Nuzo";

### Durable Intent

Treat durable-intent language as an explicit request to start the Nuzo capture
flow, even when the user does not name Nuzo directly. Durable-intent language
includes requests such as:

- "always do this";
- "from now on";
- "in every conversation";
- "for future sessions";
- "next time";
- "when I open a new session";
- "remember this";
- "keep this";
- "this is how I want you to work".

Do not silently write memory. Call `memory.suggest_capture`, show the draft and
any duplicate or relationship evidence, and ask for confirmation before calling
`memory.confirm_capture`. If the durable intent is ambiguous, ask whether the
user wants the behavior saved in Nuzo for future sessions.

If the user asks for both an immediate local action and durable behavior,
perform the immediate action when safe, then start the Nuzo capture flow for the
durable behavior. For example, if the user asks Codex to create or update a
local `AGENTS.<folder-name>.md` file in every conversation, update the local
file when safe and propose a Nuzo memory draft for the cross-session workflow
instruction.

For every explicit save request:

1. Rewrite the requested content into a short affirmative memory without adding
   facts the user did not state.
2. Choose the narrowest useful scope.
3. Call `memory.suggest_capture` with content, kind, scope, tags, source,
   confidence, and reason.
4. Show the validated draft, duplicate result, and any relationship evidence to
   the user before asking for a decision.
5. Offer explicit decisions: create, update, keep separate, clarify, or reject.
6. If the user confirms or edits a new memory, call `memory.confirm_capture`
   with `decision: "create"` and `confirm: true`.
7. If the user confirms an update, call `memory.confirm_capture` with
   `decision: "update"`, the displayed `target_memory_id`, and the displayed
   `expected_revision`.
8. If the user wants a related memory saved separately, call
   `memory.confirm_capture` with `decision: "keep_separate"` and
   `confirm: true`.
9. If the user rejects or asks to clarify, call `memory.confirm_capture` with
   `decision: "reject"` or `decision: "clarify"` only when a structured
   no-write result is useful. Otherwise, write nothing.

Suggest a small set of lowercase topical tags from subjects the user actually
stated. For example, a recurring Cloudflare workflow may use `cloudflare`,
`docker`, and `workflow`. Add `autoload` only when the memory should be loaded
at every session start in its scope; topic-specific memories should rely on
contextual recall.

### Inferred Capture

For inferred memories, call `memory.suggest_capture` only when the statement is
stable, useful in future sessions, specific, safe, and not obviously transient.

Good inferred candidates include:

- durable user preferences;
- project architecture or product decisions;
- recurring repository workflow instructions;
- stable facts about the project;
- cross-session agent workflow notes.

Do not infer memories from one-off task state, command output, logs,
speculation, private file contents, or secrets.

### Updates And Audit

Keep project decisions in the active project scope and cross-project preferences
in `user:default`.

If a new statement changes an existing memory, prefer showing the existing
memory, its revision, and bounded relationship evidence before asking whether
to update it instead of creating a duplicate. Use `memory.confirm_capture` with
the displayed memory's expected revision only after the user confirms or edits
the update draft.
If the update reports a revision conflict, re-read the memory and ask again; do
not retry silently.

Use `memory.history` when the user needs an audit trail. Preview
`memory.forget_many` before applying bulk archive or deletion.

### Explicit Forget Requests

When the user asks to remove or forget a memory:

1. Use `memory.list`, `memory.recall`, or `memory.history` to identify the
   intended memory without guessing.
2. Show the memory ID, current revision, scope, and a concise content preview.
3. Offer archive as the reversible default. Treat permanent deletion as a
   separate destructive choice that requires explicit confirmation.
4. Call `memory.forget` with the displayed ID and `expected_revision`. Use
   `mode: "archive"` for the reversible path. Use `mode: "delete"` and
   `confirm: true` only after the user explicitly requests permanent deletion.
5. If the operation reports a revision conflict, re-read the memory and ask
   again; do not retry silently.
6. Report what changed. Do not claim the memory was removed until the tool
   succeeds.

For multiple memories, preview `memory.forget_many` first, show the bounded
matched IDs/count, and apply only the operation the user confirms.

## Safety

- Save only stable information useful in future sessions.
- Never store secrets, tokens, credentials, cookies, private keys, raw private
  files, or transient command logs.
- Do not silently save inferred memories.
- Do not store raw conversation excerpts when a concise memory would be enough.
- Keep Nuzo import/export as the portability format across hosts.

## Tools

- `memory.remember`
- `memory.recall`
- `memory.recall_hook`
- `memory.suggest_capture`
- `memory.confirm_capture`
- `memory.list`
- `memory.update`
- `memory.history`
- `memory.forget`
- `memory.forget_many`
- `memory.export`
- `memory.import`
- `memory.doctor`
