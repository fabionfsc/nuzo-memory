# Capture Suggestions

Capture suggestions are draft memories proposed by an agent before anything is written to storage.

They exist to make Nuzo useful without turning memory into hidden state.

## Decision

Nuzo starts capture as host or agent behavior, not as a new persisted memory state.

In the MVP, a host integration may detect a memory-worthy statement and
prepare a draft, but persistence still routes through explicit confirmation
after user approval. Confirmed capture uses `memory.confirm_capture`, which in
turn routes writes through the canonical remember and update behavior.

```text
conversation context
  -> candidate detection
  -> memory.suggest_capture
  -> validated memory draft
  -> user confirm / edit / reject
  -> memory.confirm_capture
```

There is no silent write path.

Candidate detection is outside Nuzo core. The host or agent may decide that a
message looks durable, but the Nuzo MCP server provides `memory.suggest_capture`
as the read-only validation boundary before any confirmation prompt is shown.
The tool validates the draft, normalizes fields, runs secret and scope policy,
and reports exact active duplicates without writing storage or audit state. In
the `0.6.0` bounded mode it also returns versioned relationship evidence; the
default remains the exact-only `0.5.0` behavior for compatibility.

## Candidate Criteria

A statement is memory-worthy when it is:

- stable beyond the current turn;
- useful in future sessions;
- specific enough to act on;
- safe to store;
- not already represented by an equivalent active memory.

Common memory-worthy categories:

| Category | Example |
| --- | --- |
| Preference | "I prefer concise final answers." |
| Project decision | "Nuzo should keep memory business logic in `packages/core`." |
| Recurring instruction | "For this repo, run MkDocs strict before pushing docs changes." |
| Durable fact | "The docs domain for this project is `nuzo.com.br`." |
| Workflow note | "Use GitHub Issues as the execution tracker for Nuzo." |

Not every useful sentence should become memory. One-off task details, temporary errors, command output, and speculative notes should stay in the current conversation unless the user explicitly asks to save them.

## Candidate Decision Rules

Candidate detection is a host or agent heuristic. It must decide whether to
call `memory.suggest_capture`; the core service only validates the proposed
draft. Use this decision table before proposing a draft:

| Signal | Action | Example |
| --- | --- | --- |
| Durable preference, project decision, recurring instruction, stable fact, or repeated workflow note | Suggest a draft through `memory.suggest_capture` | "For Nuzo, always use GitHub Issues for executable work." |
| The scope is unclear, mixed between user/project/team, or likely host-specific | Ask a clarifying question before calling `memory.suggest_capture` | "Remember that for me, or only for this repo?" |
| The statement contains credentials, private file contents, sensitive customer/payment details, raw logs, one-off task state, or speculation | Do not call `memory.suggest_capture`; ask for a sanitized durable memory only if useful | "My token is `ghp_...`." |

Allowed candidates should be short, affirmative memories. Avoid storing long
conversation excerpts. Rewrite only to remove filler; do not invent stronger
claims than the user stated.

Hosts should suggest a small set of lowercase topical tags from the durable
subjects explicitly present in the statement. For example, a recurring
Cloudflare workflow may use `cloudflare`, `docker`, and `workflow`. Add
`autoload` only when the memory should be present at every session start in its
scope; ordinary topic-specific memories should be recalled when a prompt
matches their content or tags.

Blocked candidates are not "rejected memories". They should leave no memory,
draft record, audit event, or hidden note unless the user explicitly provides a
safe replacement and confirms it.

## Draft Format

A capture suggestion should be shown as a small, editable draft:

```json
{
  "content": "The user prefers concise final answers.",
  "kind": "preference",
  "scope": "user:default",
  "tags": ["workflow"],
  "source": "codex:capture-suggestion",
  "confidence": 0.72,
  "reason": "The user stated a recurring response style preference.",
  "requires_confirmation": true
}
```

Draft fields:

| Field | Required | Notes |
| --- | --- | --- |
| `content` | yes | The exact memory text proposed for persistence. |
| `kind` | yes | One of `preference`, `project_decision`, `fact`, `instruction`, or `note`. |
| `scope` | yes | Defaults by the scope rules below. |
| `tags` | yes | Short lowercase tags for filtering. |
| `source` | yes | Host and path that produced the draft, such as `codex:capture-suggestion`. |
| `confidence` | yes | Confidence in the draft, not permission to save it. |
| `reason` | yes | Short explanation shown to the user. |
| `requires_confirmation` | yes | Must be `true` for inferred writes. |

The draft is not a stored memory. It has no memory ID until `memory.remember` succeeds.

Drafts returned by `memory.suggest_capture` always include
`requires_confirmation: true` and `memory_writes: false` in the tool response.

## User Flow

Capture suggestions must offer explicit outcomes:

| Outcome | Behavior |
| --- | --- |
| Create | Call `memory.confirm_capture` with `decision: "create"` and `confirm: true`. |
| Update | Call `memory.confirm_capture` with `decision: "update"`, `target_memory_id`, `expected_revision`, and `confirm: true`. |
| Keep separate | Call `memory.confirm_capture` with `decision: "keep_separate"` and `confirm: true`. |
| Clarify | Ask a clarifying question and call `memory.confirm_capture` with `decision: "clarify"` only if a machine-readable no-write result is needed. |
| Reject | Do not write anything. The rejection itself is not stored unless the user explicitly asks. |

The confirmation prompt should be direct:

```text
Save this Nuzo memory?

Content: The user prefers concise final answers.
Kind: preference
Scope: user:default
Tags: workflow
Reason: The user stated a recurring response style preference.

Create, edit, keep separate, clarify, or reject?
```

Agents may batch multiple suggestions, but each suggested memory must remain inspectable and individually rejectable.

## Duplicate Handling

By default, `memory.suggest_capture` checks active memories in the same scope
before a host asks the user to save a draft.

For the MVP, duplicate detection is exact and conservative:

- trim leading and trailing whitespace;
- collapse repeated whitespace to one space;
- compare content case-insensitively;
- ignore archived memories;
- ignore tags, kind, source, and confidence.

When a duplicate exists, the response status is `duplicate`, `memory_writes` is
still `false`, and the existing memory is returned for display. Hosts should
normally show the existing memory and skip the save prompt unless the user
explicitly asks to create a separate memory.

## Relationship Evidence Contract

Relationship analysis is opt-in so existing clients cannot silently
misinterpret a new decision as the legacy `ready` result.

Relationship meanings are normative:

| Relationship | Contract meaning |
| --- | --- |
| `exact_duplicate` | Draft content equals an active same-scope memory after the existing case-insensitive, whitespace-collapsed normalization. |
| `update_candidate` | The draft appears to revise the same durable assertion, preference, decision, or instruction, such that keeping both active would be contradictory or misleading. |
| `related` | The draft and an active same-scope memory share durable subject matter, but both may remain true and independently useful. |
| `independent` | Exhaustive bounded retrieval found no active same-scope candidate meeting the documented evidence threshold. |
| `uncertain` | Evidence is weak, conflicting, ambiguous between relationships, or non-exhaustive in a way that could change the decision. |

These relationships describe evidence, not truth. In particular,
`update_candidate` does not establish that the draft is newer or correct, and
`independent` does not authorize creation. Policy rejection is a separate,
terminal outcome and is never represented as a relationship.

The core input adds:

```ts
type CaptureRelationshipMode = "exact" | "bounded";

interface SuggestCaptureInput extends RememberMemoryInput {
  reason: string;
  relationshipMode?: CaptureRelationshipMode;
}
```

Omitting `relationshipMode` means `exact` and preserves the `0.5.0` result
shape. `bounded` requests the new relationship fields. At the MCP boundary the
same input is named `relationship_mode`.

The bounded core result adds these contracts:

```ts
type CaptureRelationship =
  | "exact_duplicate"
  | "update_candidate"
  | "related"
  | "independent"
  | "uncertain";

interface CaptureRelationshipCandidate {
  memory: MemoryRecord;
  matchedTerms: string[];
  matchedTags: string[];
  reason: string;
}

interface CaptureRelationshipEvidence {
  version: 1;
  primaryMemoryId: string | null;
  candidateLimit: 20;
  returnedLimit: 3;
  evaluatedCount: number;
  searchExhaustive: boolean;
  evidenceTruncated: boolean;
  reason: string;
  candidates: CaptureRelationshipCandidate[];
}

interface BoundedCaptureSuggestionResult {
  status: "ready" | "duplicate" | "review";
  memoryWrites: false;
  requiresConfirmation: true;
  draft: CaptureSuggestionDraft;
  duplicate: MemoryRecord | null;
  relationshipMode: "bounded";
  relationship: CaptureRelationship;
  relationshipEvidence: CaptureRelationshipEvidence;
}
```

Exact-mode results retain the existing `CaptureSuggestionResult` fields only.
Bounded mode uses this status mapping:

| Relationship | Status | Primary memory | Host behavior before any write |
| --- | --- | --- | --- |
| `exact_duplicate` | `duplicate` | Required | Show the existing memory; default to no write. |
| `update_candidate` | `review` | Required | Show current and proposed content; offer a confirmed update. |
| `related` | `review` | Required | Explain the relation; ask whether to keep a separate memory. |
| `independent` | `ready` | `null` | Offer confirmed creation. |
| `uncertain` | `review` | `null` | Ask for clarification; do not offer a default write. |

`status` remains for compatibility and coarse control flow. Bounded clients
must use `relationship` for the decision and must never treat `review` as
creation-ready.

### Evidence Rules And Limits

- Policy validation and scope authorization run before candidate lookup. A
  blocked candidate returns the existing structured policy error, not a
  relationship.
- Candidate lookup uses only active memories in the resolved target scope. It
  does not include `user:default`, another project, or any other scope unless
  that scope is itself the explicit authorized target.
- Exact normalized duplicate lookup is deterministic and happens before
  ranked evaluation. It must not become a best-effort result hidden by the
  ranked candidate cap.
- Ranked evaluation considers at most 20 candidates and returns at most 3,
  ordered from strongest to weakest evidence. Equivalent evidence is ordered
  by memory ID ascending so repeated evaluation is deterministic.
- Each returned candidate includes the complete authorized memory record, at
  most 8 matched terms, at most 8 matched tags, and a reason no longer than
  1,000 characters.
- The top-level reason is also limited to 1,000 characters.
- `evaluatedCount` is between 0 and 20. `candidates` contains between 0 and 3
  items. `evidenceTruncated` is true when qualifying evidence was omitted from
  the returned list.
- `searchExhaustive` says whether candidate retrieval proved that no additional
  candidate could change the decision. Hitting the evaluation limit normally
  makes it false.
- `primaryMemoryId` equals the first candidate's memory ID for
  `exact_duplicate`, `update_candidate`, and `related`.
- `independent` requires `primaryMemoryId: null`, an empty candidate list,
  `searchExhaustive: true`, and `evidenceTruncated: false`.
- `uncertain` requires `primaryMemoryId: null`. It is mandatory when evidence
  is ambiguous or a non-exhaustive search cannot safely establish
  independence.
- An exact duplicate short-circuits broader classification. The legacy
  `duplicate` field and bounded primary candidate refer to the same memory. Its
  bounded evidence reports one evaluated and returned candidate,
  `searchExhaustive: true`, and `evidenceTruncated: false`.

The evidence version starts at `1`. Additive fields may be introduced within
that version, but changing relationship meaning, limits, required fields, or
status mapping requires an explicit contract and versioning decision.

### Compatibility And Failure Safety

- Existing clients omit relationship mode and continue receiving only
  `ready` or `duplicate` with the legacy `duplicate` field.
- New clients request bounded mode and require `relationshipMode: "bounded"`
  in the core result or `relationship_mode: "bounded"` in public JSON.
- If a bounded request reaches an older server, an unknown-input error or a
  missing response marker is treated as unsupported. The client must clarify
  or fall back to explicit exact-only behavior; it must not assume
  `independent`.
- Relationship output does not create a memory, append an audit event, change
  a revision, update `last_used_at`, or persist a draft.
- Relationship evidence cannot call or authorize `memory.remember` or
  `memory.update`. Those remain separate, explicitly confirmed operations.
- No relationship result is retained for analytics, telemetry, or later
  background processing.

## Update Handling

Some capture candidates are not exact duplicates, but they clearly change an
existing memory. Hosts should treat these as update candidates instead of
creating unbounded new memories.

Use this decision table:

| Candidate relationship | Host behavior |
| --- | --- |
| `exact_duplicate` | Show the duplicate returned by `memory.suggest_capture`; do not write a new memory by default. |
| `update_candidate` | Show the existing memory and proposed replacement; call `memory.confirm_capture` with `decision: "update"` only after the user confirms or edits the change. |
| `related` | Ask whether to save a separate memory, then call `memory.confirm_capture` with `decision: "keep_separate"` only after confirmation. |
| `independent` | Offer to save through `memory.confirm_capture` with `decision: "create"`, but only after confirmation. |
| `uncertain` | Ask a clarifying question before saving or updating. |

Update prompts should include the current memory content, proposed content,
kind, scope, tags, and reason. The host should pass `expected_revision` from the
memory it displayed to the user. If `memory.confirm_capture` or `memory.update` returns
`MEMORY_REVISION_CONFLICT`, the host must re-read the current memory and ask the
user again; it must not retry silently.

Confirmed updates remain subject to the same policy checks as new memories:
secret scanning, scope validation, tag normalization, authorization, and audit
history.

`memory.confirm_capture` is a convenience boundary for confirmed capture flows.
It still routes writes through the canonical remember and update behavior.
`reject` and `clarify` decisions write nothing.

## Scope Rules

Choose the narrowest useful scope.

| Situation | Default scope |
| --- | --- |
| Cross-project user preference | `user:default` |
| Project architecture decision | `project:<path-hash>` |
| Project workflow rule | `project:<path-hash>` |
| Host-specific usage preference | `agent:<name>` |
| Unclear or mixed scope | Ask before saving. |

Do not promote project-specific information to `user:default` by default.

## Allowed Examples

These examples may produce drafts:

| User statement | Draft kind | Default scope |
| --- | --- | --- |
| "For Nuzo, always use GitHub Issues for executable work." | `instruction` | `project:<path-hash>` |
| "I prefer Apache-2.0 for this project." | `project_decision` | `project:<path-hash>` |
| "I like concise status updates while work is running." | `preference` | `user:default` |
| "This repo uses `/tmp/nuzo-git` as the git dir workaround." | `fact` | `project:<path-hash>` |
| "When changing MCP tools, update `docs/spec/tools.md` first." | `instruction` | `project:<path-hash>` |
| "For Cloudflare work on this host, use `/opt/docker/cloudflare`." | `instruction` | `user:default` |

## Blocked Examples

These examples must not produce a persisted memory unless the user explicitly rewrites them into a safe memory:

| Input | Reason |
| --- | --- |
| "My token is `ghp_...`." | Secret. |
| "Here is my `.env` file..." | Raw private file content. |
| "The build failed once with this stack trace..." | Transient log. |
| "Use password `hunter2` for local testing." | Credential. |
| "I might maybe switch to Postgres later." | Speculative and not durable. |
| "The customer said their card failed." | Sensitive personal or payment context. |

When blocked, the agent may explain that Nuzo avoids storing that kind of content and ask for a sanitized durable preference or decision instead.

## Host Responsibilities

Host plugins may provide prompts, skills, or hooks that create capture drafts.

They must not contain:

- secret detection logic beyond calling `memory.suggest_capture` or confirmed
  core policy checks;
- separate memory schemas;
- storage behavior;
- host-specific import/export formats;
- automatic write paths.

Confirmed host flows must call `memory.confirm_capture` with the explicit user
decision. Confirmed new memories route through the canonical remember behavior,
and confirmed replacements route through the canonical update behavior with the
revision shown to the user. Host wrappers must not write storage directly.

## Core Responsibilities

Core must validate both capture suggestions and confirmed writes.

`memory.suggest_capture` is responsible for:

- applying the same content, kind, scope, tag, source, confidence, secret, and
  authorization policy as `memory.remember`;
- returning a normalized draft;
- detecting exact active duplicates in the same scope in every mode;
- returning the versioned, bounded relationship result only when the caller
  explicitly requests it;
- classifying relationship evidence in core rather than a CLI, MCP handler, or
  host plugin;
- staying read-only.

Confirmation is not a bypass for:

- secret scanning;
- kind validation;
- scope validation;
- tag normalization;
- duplicate detection;
- disabled-scope checks.

If core rejects a confirmed draft, the host should show the structured error and avoid retrying automatically.

## MVP Implementation Order

1. Document capture suggestion policy.
2. Add test fixtures for allowed and blocked examples.
3. Add host prompt/skill guidance for suggesting drafts.
4. Add optional read-only recall hook.
5. Add `memory.suggest_capture` as a read-only validation and duplicate check.
6. Add confirmed capture flow that routes explicit decisions through
   `memory.confirm_capture`, backed by canonical remember and update behavior.

Do not add a capture hook that writes directly to storage.
