import { chmodSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function ensureStoreDirectory(storePath: string): void {
  mkdirSync(dirname(storePath), { recursive: true, mode: 0o700 });
}

export function ensurePrivateDirectory(path: string): void {
  const existed = pathExists(path);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (!existed) chmodSync(path, 0o700);
}

export function pathExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

export function writePrivateFile(path: string, content: string): void {
  writeFileSync(path, content, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}
