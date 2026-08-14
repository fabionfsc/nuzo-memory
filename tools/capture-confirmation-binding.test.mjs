import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  InMemoryNonceLedger,
  issueStatelessDigest,
  MinimalStateBindingServer,
  SQLiteNonceLedger,
  verifyStatelessDigest,
} from "./capture-confirmation-binding-prototype.mjs";

const sampleDraft = Object.freeze({
  content: "Use the reviewed release checklist.",
  kind: "project_decision",
  scope: "project:nuzo",
  tags: ["release", "reviewed"],
  provenance: {
    kind: "conversation",
    host: "codex",
    surface: "mcp",
    action: "capture_confirmed",
  },
  candidateId: "mem_candidate_000001",
  candidateRevision: 3,
});

function consumeInSeparateProcess(input) {
  const prototypeUrl = new URL("./capture-confirmation-binding-prototype.mjs", import.meta.url).href;
  const program = `
    const { MinimalStateBindingServer, SQLiteNonceLedger } =
      await import(process.env.NUZO_BINDING_PROTOTYPE_URL);
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const ledger = new SQLiteNonceLedger(input.ledgerPath);
    const server = new MinimalStateBindingServer({ key: Buffer.from(input.key, "base64"), ledger });
    process.stdout.write(server.consume(input.token, input.draft, input.now));
    ledger.close();
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    encoding: "utf8",
    env: { ...process.env, NUZO_BINDING_PROTOTYPE_URL: prototypeUrl },
    input: JSON.stringify(input),
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("fully stateless digest binds every reviewed field but permits replay", () => {
  const expiresAt = 2_000;
  const token = issueStatelessDigest(sampleDraft, expiresAt);
  assert.doesNotMatch(token, /Use the reviewed|project:nuzo|release/u);
  assert.equal(verifyStatelessDigest(token, sampleDraft, 1_000), "accepted");
  assert.equal(verifyStatelessDigest(token, sampleDraft, 1_000), "accepted");

  for (const changed of [
    { ...sampleDraft, content: "Mutated content." },
    { ...sampleDraft, kind: "note" },
    { ...sampleDraft, scope: "project:other" },
    { ...sampleDraft, tags: ["release"] },
    { ...sampleDraft, candidateRevision: 4 },
  ]) {
    assert.equal(verifyStatelessDigest(token, changed, 1_000), "binding_mismatch");
  }
  assert.equal(verifyStatelessDigest(token, sampleDraft, expiresAt + 1), "expired");
});

test("fully stateless digest is reproducible by any host and fingerprints predictable drafts", () => {
  const expiresAt = 2_000;
  const issued = issueStatelessDigest(sampleDraft, expiresAt);
  const recomputedWithoutServerAuthority = issueStatelessDigest(sampleDraft, expiresAt);
  assert.equal(recomputedWithoutServerAuthority, issued);
});

test("minimal-state HMAC rejects mutation, scope substitution, expiry, and replay", () => {
  const server = new MinimalStateBindingServer({
    key: Buffer.alloc(32, 7),
    ledger: new InMemoryNonceLedger(),
  });

  const contentToken = server.issue(sampleDraft, 2_000, "content-change");
  assert.equal(server.consume(contentToken, { ...sampleDraft, content: "Changed." }, 1_000), "binding_mismatch");

  const scopeToken = server.issue(sampleDraft, 2_000, "scope-change");
  assert.equal(server.consume(scopeToken, { ...sampleDraft, scope: "project:other" }, 1_000), "binding_mismatch");

  const expiredToken = server.issue(sampleDraft, 2_000, "expired");
  assert.equal(server.consume(expiredToken, sampleDraft, 2_001), "expired");

  const acceptedToken = server.issue(sampleDraft, 2_000, "accepted");
  assert.equal(server.consume(acceptedToken, sampleDraft, 1_000), "accepted");
  assert.equal(server.consume(acceptedToken, sampleDraft, 1_000), "replay");
});

test("minimal-state HMAC requires a shared key and ledger across server instances", () => {
  const sharedLedger = new InMemoryNonceLedger();
  const sharedKey = Buffer.alloc(32, 9);
  const instanceOne = new MinimalStateBindingServer({ key: sharedKey, ledger: sharedLedger });
  const instanceTwo = new MinimalStateBindingServer({ key: sharedKey, ledger: sharedLedger });
  const token = instanceOne.issue(sampleDraft, 2_000, "shared-instances");
  assert.equal(instanceTwo.consume(token, sampleDraft, 1_000), "accepted");
  assert.equal(instanceOne.consume(token, sampleDraft, 1_000), "replay");

  const isolatedInstance = new MinimalStateBindingServer({
    key: sharedKey,
    ledger: new InMemoryNonceLedger(),
  });
  const isolatedToken = instanceOne.issue(sampleDraft, 2_000, "isolated-instance");
  assert.equal(isolatedInstance.consume(isolatedToken, sampleDraft, 1_000), "unknown");

  const rotatedInstance = new MinimalStateBindingServer({
    key: Buffer.alloc(32, 10),
    ledger: sharedLedger,
  });
  assert.equal(rotatedInstance.consume(isolatedToken, sampleDraft, 1_000), "binding_mismatch");
});

test("two Node processes share a SQLite nonce ledger and reject replay", () => {
  const directory = mkdtempSync(join(tmpdir(), "nuzo-binding-processes-"));
  try {
    const ledgerPath = join(directory, "nonces.sqlite");
    const key = Buffer.alloc(32, 12);
    const ledger = new SQLiteNonceLedger(ledgerPath);
    const issuer = new MinimalStateBindingServer({ key, ledger });
    const token = issuer.issue(sampleDraft, 2_000, "two-real-processes");
    ledger.close();
    const input = {
      ledgerPath,
      key: key.toString("base64"),
      token,
      draft: sampleDraft,
      now: 1_000,
    };
    assert.equal(consumeInSeparateProcess(input), "accepted");
    assert.equal(consumeInSeparateProcess(input), "replay");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("edited drafts need a newly displayed binding and ledger rollback re-enables replay", () => {
  const ledger = new InMemoryNonceLedger();
  const key = Buffer.alloc(32, 11);
  const server = new MinimalStateBindingServer({ key, ledger });
  const edited = { ...sampleDraft, content: "Use the final reviewed release checklist." };
  const originalToken = server.issue(sampleDraft, 2_000, "before-edit");
  assert.equal(server.consume(originalToken, edited, 1_000), "binding_mismatch");
  const editedToken = server.issue(edited, 2_000, "after-edit");
  const ledgerBackup = ledger.snapshot();
  assert.equal(server.consume(editedToken, edited, 1_000), "accepted");

  const restoredServer = new MinimalStateBindingServer({
    key,
    ledger: new InMemoryNonceLedger(ledgerBackup),
  });
  assert.equal(restoredServer.consume(editedToken, edited, 1_000), "accepted");
});
