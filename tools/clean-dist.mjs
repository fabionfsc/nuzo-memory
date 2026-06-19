#!/usr/bin/env node
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const packageName of ["core", "cli", "mcp-server"]) {
  rmSync(join(repositoryRoot, "packages", packageName, "dist"), {
    recursive: true,
    force: true,
  });
}

console.log("removed package dist directories");
