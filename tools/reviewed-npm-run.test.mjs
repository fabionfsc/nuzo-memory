import assert from "node:assert/strict";
import test from "node:test";

import { verifyReviewedNpmRun } from "./reviewed-npm-run.mjs";

const version = "1.1.0";
const runId = "123456789";
const repository = "fabionfsc/nuzo-memory";
const expectedSha = "a".repeat(40);
const artifactName = `nuzo-npm-${version}-${expectedSha}`;

test("reviewed npm run binds a successful dry run and its retained artifact", async () => {
  const result = await verifyReviewedNpmRun({
    version,
    runId,
    repository,
    expectedSha,
    token: "test-token",
    fetchImpl: createFetch(),
  });

  assert.equal(result.artifactName, artifactName);
  assert.equal(result.artifact.id, 987);
});

test("reviewed npm run rejects a different source commit", async () => {
  await assert.rejects(
    verifyReviewedNpmRun({
      version,
      runId,
      repository,
      expectedSha: "b".repeat(40),
      token: "test-token",
      fetchImpl: createFetch(),
    }),
    /reviewed npm source commit mismatch/u,
  );
});

test("reviewed npm run rejects a live publish run", async () => {
  await assert.rejects(
    verifyReviewedNpmRun({
      version,
      runId,
      repository,
      expectedSha,
      token: "test-token",
      fetchImpl: createFetch({ publishConclusion: "success" }),
    }),
    /Publish packages with provenance conclusion mismatch/u,
  );
});

test("reviewed npm run rejects the current run, reruns, and incomplete dry-run evidence", async () => {
  await assert.rejects(
    verifyReviewedNpmRun({
      version,
      runId,
      repository,
      expectedSha,
      token: "test-token",
      currentRunId: runId,
      fetchImpl: createFetch(),
    }),
    /different from the current publish run/u,
  );
  await assert.rejects(
    verifyReviewedNpmRun({
      version,
      runId,
      repository,
      expectedSha,
      token: "test-token",
      fetchImpl: createFetch({ runOverrides: { run_attempt: 2 } }),
    }),
    /reviewed npm run attempt mismatch/u,
  );
  await assert.rejects(
    verifyReviewedNpmRun({
      version,
      runId,
      repository,
      expectedSha,
      token: "test-token",
      fetchImpl: createFetch({ omitStep: "Dry-run npm publish" }),
    }),
    /exactly one Dry-run npm publish step/u,
  );
});

test("reviewed npm run rejects changed workflow and source trust boundaries", async () => {
  for (const runOverrides of [
    { workflow_id: 1 },
    { name: "Other workflow" },
    { path: ".github/workflows/other.yml" },
    { event: "push" },
    { status: "in_progress", conclusion: null },
    { conclusion: "failure" },
    { head_branch: "release-candidate" },
    { head_repository: { full_name: "attacker/nuzo-memory" } },
  ]) {
    await assert.rejects(
      verifyReviewedNpmRun({
        version,
        runId,
        repository,
        expectedSha,
        token: "test-token",
        fetchImpl: createFetch({ runOverrides }),
      }),
      /mismatch/u,
    );
  }
});

test("reviewed npm run rejects a missing, duplicate, or expired artifact", async () => {
  for (const artifacts of [
    [],
    [artifact(), artifact({ id: 988 })],
    [artifact({ expired: true })],
    [artifact({ size_in_bytes: 0 })],
    [artifact({ id: 0 })],
    [artifact({ workflow_run: { id: Number(runId), head_sha: "b".repeat(40), head_branch: "main" } })],
  ]) {
    await assert.rejects(
      verifyReviewedNpmRun({
        version,
        runId,
        repository,
        expectedSha,
        token: "test-token",
        fetchImpl: createFetch({ artifacts }),
      }),
      /exactly one|expired|empty|artifact ID is invalid|artifact source commit mismatch/u,
    );
  }
});

test("reviewed npm run fails closed on API errors and missing credentials", async () => {
  await assert.rejects(
    verifyReviewedNpmRun({
      version,
      runId,
      repository,
      expectedSha,
      token: "",
      fetchImpl: createFetch(),
    }),
    /GITHUB_TOKEN is required/u,
  );
  await assert.rejects(
    verifyReviewedNpmRun({
      version,
      runId,
      repository,
      expectedSha,
      token: "test-token",
      fetchImpl: async () => response({}, 403),
    }),
    /GitHub Actions API request failed \(403\)/u,
  );
});

function createFetch({
  publishConclusion = "skipped",
  artifacts = [artifact()],
  runOverrides = {},
  omitStep,
} = {}) {
  return async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer test-token");
    if (url.endsWith("/actions/workflows/release-npm.yml")) {
      return response({
        id: 299136425,
        path: ".github/workflows/release-npm.yml",
        state: "active",
      });
    }
    if (url.endsWith(`/actions/runs/${runId}`)) {
      return response({
        id: Number(runId),
        workflow_id: 299136425,
        name: "Release npm",
        path: ".github/workflows/release-npm.yml",
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        run_attempt: 1,
        head_sha: expectedSha,
        head_branch: "main",
        head_repository: { full_name: repository },
        ...runOverrides,
      });
    }
    if (url.endsWith(`/actions/runs/${runId}/jobs?filter=latest&per_page=100`)) {
      return response({
        total_count: 1,
        jobs: [{
          name: "npm trusted publishing",
          conclusion: "success",
          head_sha: expectedSha,
          steps: [
            { name: "Validate source release state", conclusion: "success" },
            { name: "Run validation gates", conclusion: "success" },
            { name: "Verify npm publish targets", conclusion: "success" },
            { name: "Verify generated npm artifact manifest", conclusion: "success" },
            { name: "Dry-run npm publish", conclusion: "success" },
            { name: "Retain reviewed npm candidates", conclusion: "success" },
            { name: "Bind publish to reviewed npm artifact manifest", conclusion: "skipped" },
            { name: "Publish packages with provenance", conclusion: publishConclusion },
          ].filter((step) => step.name !== omitStep),
        }],
      });
    }
    if (url.endsWith(`/actions/runs/${runId}/artifacts?per_page=100`)) {
      return response({ total_count: artifacts.length, artifacts });
    }
    throw new Error(`unexpected test URL: ${url}`);
  };
}

function artifact(overrides = {}) {
  return {
    id: 987,
    name: artifactName,
    expired: false,
    size_in_bytes: 4096,
    workflow_run: {
      id: Number(runId),
      head_sha: expectedSha,
      head_branch: "main",
    },
    ...overrides,
  };
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}
