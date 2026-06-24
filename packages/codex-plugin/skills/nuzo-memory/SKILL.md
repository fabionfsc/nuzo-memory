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

When a new task may depend on prior project context, user preferences,
decisions, or recurring workflow notes, call `memory.recall_hook` before doing
substantial work.

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

For every explicit save request:

1. Rewrite the requested content into a short affirmative memory without adding
   facts the user did not state.
2. Choose the narrowest useful scope.
3. Call `memory.suggest_capture` with content, kind, scope, tags, source,
   confidence, and reason.
4. Show the validated draft or duplicate result to the user.
5. If the user confirms or edits the draft, call `memory.remember` with the
   final user-approved fields.
6. If the user rejects the draft, do not write memory, audit events, or hidden
   notes.

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
memory and asking whether to update it instead of creating a duplicate. Use
`memory.update` with the displayed memory's expected revision only after the user confirms or edits the update draft.
If the update reports a revision conflict, re-read the memory and ask again; do
not retry silently.

Use `memory.history` when the user needs an audit trail. Preview
`memory.forget_many` before applying bulk archive or deletion.

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
- `memory.list`
- `memory.update`
- `memory.history`
- `memory.forget`
- `memory.forget_many`
- `memory.export`
- `memory.import`
- `memory.doctor`
