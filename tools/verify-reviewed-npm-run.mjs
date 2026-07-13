#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { assertReleaseVersion, fail } from "./release-shared.mjs";
import { verifyReviewedNpmRun } from "./reviewed-npm-run.mjs";

const version = process.argv[2];
const runId = process.argv[3];
const expectedSha = process.argv[4];
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;

assertReleaseVersion(version);

try {
  const result = await verifyReviewedNpmRun({
    version,
    runId,
    repository,
    expectedSha,
    token,
    currentRunId: process.env.GITHUB_RUN_ID,
  });
  console.log(
    `reviewed npm run verified: run=${runId} artifact=${result.artifactName} id=${result.artifact.id}`,
  );
  if (process.env.GITHUB_OUTPUT !== undefined) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `artifact_id=${result.artifact.id}\nartifact_name=${result.artifactName}\n`,
      "utf8",
    );
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
