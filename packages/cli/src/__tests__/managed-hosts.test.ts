import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readManagedHostsReceipt, recordManagedHosts } from "../managed-hosts.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("managed host receipt", () => {
  it("records exactly the current consented hosts without secrets", () => {
    const root = temporaryRoot();
    const path = join(root, ".nuzo", "managed-hosts.json");
    recordManagedHosts([
      { host: "codex" },
      { host: "claude-code", scope: "project" },
    ], path);
    const receipt = recordManagedHosts([{ host: "codex" }], path);

    expect(receipt.hosts).toEqual([{ host: "codex" }]);
    expect(readManagedHostsReceipt(path)?.hosts).toEqual(receipt.hosts);
    expect(readFileSync(path, "utf8")).not.toMatch(/token|password|memory content/iu);
  });

  it("rejects malformed receipts instead of broadening host access", () => {
    const root = temporaryRoot();
    const path = join(root, "managed-hosts.json");
    writeFileSync(path, JSON.stringify({ format: "nuzo-managed-hosts", version: 1, hosts: [{ host: "other" }] }));
    expect(() => readManagedHostsReceipt(path)).toThrow("managed host receipt is invalid");
  });
});

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "nuzo-managed-hosts-test-"));
  roots.push(root);
  return root;
}
