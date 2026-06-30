#!/usr/bin/env node

try {
  if (process.env.NUZO_SKIP_POSTINSTALL === "1") {
    process.exit(0);
  }

  console.log(`
Nuzo installed.

Start here:
  nuzo setup

Later, after updating Nuzo:
  nuzo update
`);
} catch {
  process.exit(0);
}
