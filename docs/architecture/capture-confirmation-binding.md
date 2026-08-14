# Capture Confirmation Binding Decision

Status: evaluated with executable reference prototypes for `1.2.0`; no token is
added to the public capture contract.

## Existing Trust Boundary

`memory.suggest_capture` is read-only. `memory.confirm_capture` accepts the
final fields plus `confirm: true`, which is the host's attestation that it
displayed that draft and received an explicit decision. Nuzo validates and
secret-scans the submitted fields, but a stateless server cannot observe the
human interaction.

No token can upgrade that host statement into authenticated proof of consent.
A compromised host can request a token for fields of its choice, claim that it
displayed them, and call the confirmation tool. Human presence, UI identity,
and host integrity remain non-goals.

## Threats Evaluated

| Threat | Stateless digest | HMAC plus consumed-nonce ledger | Existing host comparison |
| --- | --- | --- | --- |
| Accidental field drift | Detects it | Detects it | Host can compare the returned draft before confirming. |
| Content/kind/tag mutation | Bound | Bound | Server still validates submitted fields, but does not bind two calls. |
| Cross-scope substitution | Bound, but any host can recompute | Bound unless the host requests a fresh valid token | Host remains authorized for the submitted scope. |
| Replay | Accepted until expiry | Rejected only with atomic shared state | Confirmation remains an ordinary explicit write request. |
| Malicious or compromised host | No protection | No proof of display or consent | Explicitly outside the server's ability to attest. |
| Token observed in logs | Predictable drafts can be fingerprinted | Opaque without the secret, but correlatable | No extra correlation value exists. |

The binding input evaluated by both prototypes includes content, kind, scope,
tags, structured provenance, candidate memory ID/revision, token version, and
expiry. Tokens contain no plaintext memory.

## Prototype A: Fully Stateless Digest

The server returns a SHA-256 digest over a deterministic encoding of the final
draft and expiry. Confirmation recomputes it. The design rejects mutation,
scope substitution, expired drafts, and edits made after display. It works
across processes without shared state.

It does not provide a security boundary: any host can recompute the digest,
every valid token can be replayed until expiry, and a logged digest can
fingerprint predictable content through offline guessing. Its useful property
is accidental-drift detection, which a host can implement by comparing the
already returned draft without changing the MCP contract.

## Prototype B: Minimal-State HMAC

The stronger prototype uses HMAC-SHA-256 over the same fields plus a random
nonce, and stores nonce, expiry, and consumed state. Confirmation verifies the
MAC and atomically consumes the nonce. This rejects field mutation, scope
substitution, expiration, and normal replay without placing plaintext memory in
the token or ledger.

The stronger result introduces durable security state:

- every MCP process needs the same secret and transactional nonce ledger;
- an isolated process rejects a token issued by another process;
- key rotation invalidates outstanding drafts unless multiple key versions are
  retained;
- restoring a ledger backup from before consumption makes an old token
  replayable again;
- copying only the memory database or only the key/ledger creates different
  recovery failures;
- a user edit must be reissued, displayed again, and confirmed under a new
  token;
- cleanup, expiry, crash recovery, schema migration, and bounded ledger growth
  become maintained runtime contracts.

The executable reference tests cover replay, field mutation, scope
substitution, expiration, edited drafts, two real Node processes over one
SQLite ledger, isolated state, key rotation, and backup rollback:

```bash
node --test tools/capture-confirmation-binding.test.mjs
```

## Compatibility Assessment

Making a token required would break existing MCP hosts and direct clients.
Making it optional would preserve compatibility but allow every caller to
bypass the claimed protection. A parallel versioned confirmation tool would
avoid ambiguity, but would duplicate a public write contract and still leave
the host as the consent attestor.

Persisting a key or ledger also creates new backup and migration semantics in a
release that otherwise needs no schema change for this evaluation. Keeping the
key in ordinary config or the repository would defeat its purpose; introducing
an OS keychain recreates the unattended, multi-platform constraints described
in [Encrypted Local Stores Decision](encrypted-local-stores.md).

## Decision

Nuzo rejects capture-confirmation tokens for the final upstream release. The
stateless design adds only drift detection and a content fingerprint. The
stateful design can prevent replay by parties without the key, but its secret,
ledger, multi-process, rotation, and restore contracts are disproportionate
when the host can still mint a new draft and remains the sole consent attestor.

The supported boundary remains explicit and honest:

1. the server returns a validated, non-persistent draft;
2. the host displays the final draft;
3. edits are submitted as the final confirmation fields;
4. `confirm: true` is host attestation, not authenticated human consent;
5. core policy, scope authorization, revision checks, duplicate handling,
   secret scanning, and audit remain enforced on the write itself.

No network request, telemetry, plaintext token payload, new MCP field, schema
migration, or hidden write was introduced by this evaluation.
