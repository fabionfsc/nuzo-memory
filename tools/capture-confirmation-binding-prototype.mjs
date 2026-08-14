import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import Database from "better-sqlite3";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function encodedBinding(draft, expiresAt) {
  return JSON.stringify(canonicalize({
    version: 1,
    expiresAt,
    draft: {
      content: draft.content,
      kind: draft.kind,
      scope: draft.scope,
      tags: draft.tags,
      provenance: draft.provenance,
      candidateId: draft.candidateId,
      candidateRevision: draft.candidateRevision,
    },
  }));
}

export function issueStatelessDigest(draft, expiresAt) {
  const digest = createHash("sha256").update(encodedBinding(draft, expiresAt)).digest("base64url");
  return `digest-v1.${expiresAt}.${digest}`;
}

export function verifyStatelessDigest(token, draft, now) {
  const [version, expiresAtText] = token.split(".");
  const expiresAt = Number(expiresAtText);
  if (version !== "digest-v1" || !Number.isSafeInteger(expiresAt)) return "invalid";
  if (now > expiresAt) return "expired";
  return token === issueStatelessDigest(draft, expiresAt) ? "accepted" : "binding_mismatch";
}

export class InMemoryNonceLedger {
  constructor(entries = new Map()) {
    this.entries = entries;
  }

  issue(nonce, expiresAt) {
    this.entries.set(nonce, { expiresAt, consumed: false });
  }

  get(nonce) {
    return this.entries.get(nonce);
  }

  consume(nonce) {
    const entry = this.entries.get(nonce);
    if (entry === undefined || entry.consumed) return false;
    entry.consumed = true;
    return true;
  }

  snapshot() {
    return structuredClone(this.entries);
  }
}

export class SQLiteNonceLedger {
  constructor(path) {
    this.database = new Database(path);
    this.database.pragma("busy_timeout = 5000");
    this.database.pragma("journal_mode = WAL");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS confirmation_nonces (
        nonce TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL,
        consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0, 1))
      ) STRICT
    `);
  }

  issue(nonce, expiresAt) {
    this.database.prepare(`
      INSERT INTO confirmation_nonces (nonce, expires_at, consumed)
      VALUES (?, ?, 0)
    `).run(nonce, expiresAt);
  }

  get(nonce) {
    const row = this.database.prepare(`
      SELECT expires_at, consumed FROM confirmation_nonces WHERE nonce = ?
    `).get(nonce);
    return row === undefined
      ? undefined
      : { expiresAt: row.expires_at, consumed: row.consumed === 1 };
  }

  consume(nonce) {
    return this.database.prepare(`
      UPDATE confirmation_nonces SET consumed = 1
      WHERE nonce = ? AND consumed = 0
    `).run(nonce).changes === 1;
  }

  close() {
    this.database.close();
  }
}

export class MinimalStateBindingServer {
  constructor({ key, ledger }) {
    this.key = key;
    this.ledger = ledger;
  }

  issue(draft, expiresAt, nonce = randomBytes(18).toString("base64url")) {
    const binding = encodedBinding(draft, expiresAt);
    const mac = createHmac("sha256", this.key).update(`${nonce}.${binding}`).digest("base64url");
    this.ledger.issue(nonce, expiresAt);
    return `state-v1.${nonce}.${expiresAt}.${mac}`;
  }

  consume(token, draft, now) {
    const [version, nonce, expiresAtText, suppliedMac] = token.split(".");
    const expiresAt = Number(expiresAtText);
    if (
      version !== "state-v1" || nonce === undefined || suppliedMac === undefined ||
      !Number.isSafeInteger(expiresAt)
    ) return "invalid";
    const entry = this.ledger.get(nonce);
    if (entry === undefined || entry.expiresAt !== expiresAt) return "unknown";
    if (entry.consumed) return "replay";
    if (now > expiresAt) return "expired";
    const expectedMac = createHmac("sha256", this.key)
      .update(`${nonce}.${encodedBinding(draft, expiresAt)}`)
      .digest();
    const supplied = Buffer.from(suppliedMac, "base64url");
    if (supplied.length !== expectedMac.length || !timingSafeEqual(supplied, expectedMac)) {
      return "binding_mismatch";
    }
    return this.ledger.consume(nonce) ? "accepted" : "replay";
  }
}
