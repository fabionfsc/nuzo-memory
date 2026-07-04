import {
  chmodSync,
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { NuzoMemoryError } from "@nuzo/memory-core";

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
  writeFileWithoutFollowingLinks(path, content, 0o600);
}

export function readFileWithoutFollowingLinks(path: string): string {
  if (pathIsSymbolicLink(path)) throw unsafeWriteError(path);
  let descriptor: number | null = null;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    if (!fstatSync(descriptor).isFile()) throw unsafeWriteError(path);
    return readFileSync(descriptor, "utf8");
  } catch (error) {
    if (error instanceof NuzoMemoryError) throw error;
    throw new NuzoMemoryError("MEMORY_FILE_READ_FAILED", "Nuzo refused or failed to read the file.", { path });
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

export function pathIsSymbolicLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function writeFileWithoutFollowingLinks(path: string, content: string, mode: number): void {
  if (pathIsSymbolicLink(path)) throw unsafeWriteError(path);
  let descriptor: number | null = null;
  try {
    descriptor = openSync(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0),
      mode,
    );
    if (!fstatSync(descriptor).isFile()) throw unsafeWriteError(path);
    writeFileSync(descriptor, content, { encoding: "utf8" });
    fchmodSync(descriptor, mode);
  } catch (error) {
    if (error instanceof NuzoMemoryError) throw error;
    throw new NuzoMemoryError("MEMORY_FILE_WRITE_FAILED", "Nuzo refused or failed to write the file.", { path });
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function unsafeWriteError(path: string): NuzoMemoryError {
  return new NuzoMemoryError(
    "MEMORY_FILE_WRITE_UNSAFE",
    "Nuzo refuses to write through a symbolic link or non-file path.",
    { path },
  );
}
