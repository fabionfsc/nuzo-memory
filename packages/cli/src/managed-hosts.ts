import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { NuzoMemoryError } from "@nuzo/memory-core";
import type { HostBootstrapHost } from "./host-bootstrap.js";

export const managedHostsReceiptVersion = 1;

export interface ManagedHostEntry {
  host: HostBootstrapHost;
  scope?: string;
}

export interface ManagedHostsReceipt {
  format: "nuzo-managed-hosts";
  version: 1;
  hosts: ManagedHostEntry[];
  updated_at: string;
}

export function managedHostsReceiptPath(): string {
  return process.env.NUZO_MANAGED_HOSTS_PATH ?? join(homedir(), ".nuzo", "managed-hosts.json");
}

export function readManagedHostsReceipt(
  path = managedHostsReceiptPath(),
): ManagedHostsReceipt | null {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new NuzoMemoryError(
      "MANAGED_HOSTS_RECEIPT_INVALID",
      "The managed host receipt could not be read. Run nuzo setup again to repair it.",
    );
  }
  if (!isManagedHostsReceipt(value)) {
    throw new NuzoMemoryError(
      "MANAGED_HOSTS_RECEIPT_INVALID",
      "The managed host receipt is invalid. Run nuzo setup again to repair it.",
    );
  }
  return value;
}

export function recordManagedHosts(
  hosts: ManagedHostEntry[],
  path = managedHostsReceiptPath(),
): ManagedHostsReceipt {
  const byHost = new Map<HostBootstrapHost, ManagedHostEntry>();
  for (const entry of hosts) byHost.set(entry.host, normalizeEntry(entry));
  const receipt: ManagedHostsReceipt = {
    format: "nuzo-managed-hosts",
    version: managedHostsReceiptVersion,
    hosts: (["codex", "claude-code"] as HostBootstrapHost[])
      .map((host) => byHost.get(host))
      .filter((entry): entry is ManagedHostEntry => entry !== undefined),
    updated_at: new Date().toISOString(),
  };
  writeReceipt(path, receipt);
  return receipt;
}

function normalizeEntry(entry: ManagedHostEntry): ManagedHostEntry {
  if (entry.host === "claude-code") {
    return { host: entry.host, scope: entry.scope ?? "user" };
  }
  return { host: entry.host };
}

function writeReceipt(path: string, receipt: ManagedHostsReceipt): void {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const temporary = join(directory, `.managed-hosts.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    chmodSync(temporary, 0o600);
    renameSync(temporary, path);
    chmodSync(path, 0o600);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw new NuzoMemoryError(
      "MANAGED_HOSTS_RECEIPT_WRITE_FAILED",
      `The managed host receipt could not be written: ${(error as Error).message}`,
    );
  }
}

function isManagedHostsReceipt(value: unknown): value is ManagedHostsReceipt {
  if (value === null || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  if (
    object.format !== "nuzo-managed-hosts" ||
    object.version !== managedHostsReceiptVersion ||
    !Array.isArray(object.hosts) ||
    typeof object.updated_at !== "string"
  ) return false;
  const seen = new Set<string>();
  return object.hosts.every((entry) => {
    if (entry === null || typeof entry !== "object") return false;
    const candidate = entry as Record<string, unknown>;
    if (candidate.host !== "codex" && candidate.host !== "claude-code") return false;
    if (seen.has(candidate.host)) return false;
    seen.add(candidate.host);
    if (candidate.host === "codex") return candidate.scope === undefined;
    return candidate.scope === undefined || typeof candidate.scope === "string";
  });
}
