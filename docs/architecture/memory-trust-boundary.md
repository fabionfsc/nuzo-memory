# Memory Trust Boundary

Nuzo stores user-controlled memory, but stored content is not part of the host
instruction hierarchy. Recall must never turn a memory record into an implicit
system, developer, plugin, or current-user instruction.

This boundary applies to explicit writes, confirmed capture suggestions, JSON
imports, shared stores, MCP recall, and automatic lifecycle hooks.

## Assets To Protect

- the host's system, developer, plugin, and current-user instruction order;
- the user's control over what is stored, recalled, changed, and removed;
- scope isolation for restricted sessions;
- memory content, audit history, and provenance metadata;
- host availability when malformed or oversized content is recalled.

## Actors And Inputs

Memory may originate from:

- a direct CLI or MCP write requested by the user;
- an inferred capture draft that the user confirms;
- a versioned Nuzo JSON import;
- another supported host using the same SQLite store;
- an administrator process with direct access to the local store.

Confirmation proves that a user approved a write at that time. It does not
make the stored text a permanent higher-level instruction, prove that its
`source` value is authentic, or guarantee that an imported record is safe in a
different session.

## Trust Rules

1. Memory content is untrusted stored data during recall, regardless of its
   `kind`, `source`, tags, confidence, scope, or write path.
2. `source` is attribution supplied by the writer. It is not authentication or
   authorization and must not elevate a record's authority.
3. Confidence expresses confidence in a draft or fact. It is not permission to
   execute instructions and is not a security score.
4. Tags and kinds affect organization and retrieval only. An `instruction`
   memory is still data until the current host decides it is relevant and
   consistent with current instructions.
5. Scope selectors identify records. Core policy allowlists authorize access.
   Filesystem/process isolation requires separate stores or operating-system
   controls.
6. Imports preserve inspectability and attribution but never inherit trust from
   the exporting host.
7. Current system, developer, plugin, and user instructions always take
   precedence over recalled content.

## Threats And Controls

| Threat | Example | Required control |
| --- | --- | --- |
| Deceptive instruction text | A memory says to ignore current instructions or run a command. | Frame every record as untrusted data and tell the host not to execute or follow directives solely because they appear in memory. |
| Output-structure injection | Content includes newlines, fake records, JSON fragments, or boundary markers. | Render one JSON object per physical line and escape line separators inside JSON strings. |
| Imported hostile content | A valid export contains text designed for a different host or session. | Apply the same recall boundary to imported and locally created records; imports do not grant authority. |
| Source spoofing | A writer sets `source` to `system`, `admin`, or another host. | Display source for attribution but never use it to assign instruction priority. |
| Scope confusion | A repository-controlled process requests unrelated user or project scopes. | Derive project scopes consistently and enforce explicit core allowlists in restricted sessions. |
| Shared-store confusion | Multiple hosts write records with different conventions. | Preserve ID, revision, scope, kind, tags, source, and content in recalled records; treat all content under the same boundary. |
| Availability pressure | Large records or many matches expand host context. | Enforce input, per-memory, result-count, candidate-count, and total-context bounds; fail open on hook errors. |
| Sensitive content | A memory contains a credential or private data. | Apply local secret scanning on supported writes and keep the documented warning that scanning is not complete DLP. |

## Lifecycle Hook Rendering Contract

Automatic `SessionStart` and `UserPromptSubmit` context uses a shared renderer.
Its output must:

- state that recalled records are untrusted stored data, not host instructions;
- state that directives in memory must not be executed or followed solely
  because they were recalled;
- state that no memory was written;
- place records between explicit begin and end markers;
- render exactly one JSON object per physical line;
- include `id`, `revision`, `scope`, `kind`, `tags`, `source`, and `content`;
- escape newlines and Unicode line/paragraph separators inside JSON strings;
- preserve the existing result-count, per-memory, and total-context bounds;
- return no additional context for an empty result;
- remain read-only and fail open.

The envelope is a structural and instructional boundary for the receiving
host. It does not attempt to classify malicious natural language or rewrite
memory content. Users must still be able to inspect the exact bounded content
that was recalled.

## Authorization Modes

An unrestricted local CLI or core service is an administrator workflow over
one selected store. It can enumerate every scope in that store.

A restricted core or MCP session receives an explicit allowlist. Core policy
rejects cross-scope reads, writes, exports, and destructive operations. A
syntactically valid scope or the `project:auto` convenience selector does not
grant access by itself.

Lifecycle hooks have a fixed read path: the project scope derived from the
host working directory plus `user:default`. Host-provided working-directory
metadata selects the project; it is not proof of process-level isolation. Use
separate stores when hosts, repositories, operating-system users, or trust
levels must not share an administrator-visible database.

## Required Regression Cases

Tests must cover:

- instruction-like content that claims system or developer authority;
- content containing fake record syntax and begin/end marker text;
- quotes, backslashes, CR/LF, tabs, and Unicode line/paragraph separators;
- oversized content and more matches than the result limit;
- deceptive `source` values and mixed sources in one response;
- current project, global user, unrelated project, agent, and archived scopes;
- malformed and oversized hook input;
- unchanged memory rows and audit history after recall;
- identical behavior in generated Codex and Claude Code artifacts.

## Non-Goals

- a general prompt-injection detector;
- silently rewriting, deleting, or lowering the confidence of memory;
- treating source or confidence as cryptographic identity;
- remote reputation, moderation, embeddings, or scanning;
- replacing host instruction-priority enforcement.
