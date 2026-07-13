const workflowName = "Release npm";
const workflowPath = ".github/workflows/release-npm.yml";
const jobName = "npm trusted publishing";

export async function verifyReviewedNpmRun({
  version,
  runId,
  repository,
  expectedSha,
  token,
  currentRunId,
  fetchImpl = fetch,
}) {
  if (!/^[1-9]\d*$/u.test(String(runId)) || !Number.isSafeInteger(Number(runId))) {
    throw new Error("reviewed npm run ID must be a positive safe decimal integer");
  }
  if (!/^[0-9a-f]{40}$/u.test(expectedSha)) {
    throw new Error("expected reviewed npm source commit must be a full lowercase Git SHA");
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) {
    throw new Error("GitHub repository must use owner/name format");
  }
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("GITHUB_TOKEN is required to verify the reviewed npm run");
  }
  if (currentRunId !== undefined && String(runId) === String(currentRunId)) {
    throw new Error("reviewed npm run must be different from the current publish run");
  }

  const apiRoot = `https://api.github.com/repos/${repository}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const requestJson = async (path) => {
    const response = await fetchImpl(`${apiRoot}${path}`, { headers });
    if (!response.ok) {
      throw new Error(`GitHub Actions API request failed (${response.status}) for ${path}`);
    }
    return response.json();
  };

  const workflow = await requestJson("/actions/workflows/release-npm.yml");
  assertEqual(workflow.path, workflowPath, "reviewed npm configured workflow path");
  assertEqual(workflow.state, "active", "reviewed npm configured workflow state");
  if (!Number.isSafeInteger(workflow.id) || workflow.id <= 0) {
    throw new Error("reviewed npm configured workflow ID is invalid");
  }

  const run = await requestJson(`/actions/runs/${runId}`);
  assertEqual(run.id, Number(runId), "reviewed npm run ID");
  assertEqual(run.workflow_id, workflow.id, "reviewed npm workflow ID");
  assertEqual(run.name, workflowName, "reviewed npm workflow name");
  assertEqual(String(run.path).split("@", 1)[0], workflowPath, "reviewed npm workflow path");
  assertEqual(run.event, "workflow_dispatch", "reviewed npm workflow event");
  assertEqual(run.status, "completed", "reviewed npm run status");
  assertEqual(run.conclusion, "success", "reviewed npm run conclusion");
  assertEqual(run.run_attempt, 1, "reviewed npm run attempt");
  assertEqual(run.head_sha, expectedSha, "reviewed npm source commit");
  assertEqual(run.head_branch, "main", "reviewed npm source branch");
  assertEqual(run.head_repository?.full_name, repository, "reviewed npm source repository");

  const jobsResponse = await requestJson(`/actions/runs/${runId}/jobs?filter=latest&per_page=100`);
  assertCompletePage(jobsResponse, "reviewed npm jobs");
  const matchingJobs = Array.isArray(jobsResponse.jobs)
    ? jobsResponse.jobs.filter((job) => job.name === jobName)
    : [];
  if (matchingJobs.length !== 1) {
    throw new Error(`reviewed npm run must contain exactly one ${jobName} job`);
  }
  const job = matchingJobs[0];
  assertEqual(job.conclusion, "success", "reviewed npm job conclusion");
  assertEqual(job.head_sha, expectedSha, "reviewed npm job source commit");
  assertStep(job, "Validate source release state", "success");
  assertStep(job, "Run validation gates", "success");
  assertStep(job, "Verify npm publish targets", "success");
  assertStep(job, "Verify generated npm artifact manifest", "success");
  assertStep(job, "Dry-run npm publish", "success");
  assertStep(job, "Retain reviewed npm candidates", "success");
  assertStep(job, "Bind publish to reviewed npm artifact manifest", "skipped");
  assertStep(job, "Publish packages with provenance", "skipped");

  const artifactName = `nuzo-npm-${version}-${expectedSha}`;
  const artifactsResponse = await requestJson(`/actions/runs/${runId}/artifacts?per_page=100`);
  assertCompletePage(artifactsResponse, "reviewed npm artifacts");
  const matchingArtifacts = Array.isArray(artifactsResponse.artifacts)
    ? artifactsResponse.artifacts.filter((artifact) => artifact.name === artifactName)
    : [];
  if (matchingArtifacts.length !== 1) {
    throw new Error(`reviewed npm run must contain exactly one ${artifactName} artifact`);
  }
  const artifact = matchingArtifacts[0];
  if (artifact.expired !== false) {
    throw new Error(`reviewed npm artifact is expired or has unknown expiry state: ${artifactName}`);
  }
  if (!Number.isSafeInteger(artifact.id) || artifact.id <= 0) {
    throw new Error(`reviewed npm artifact ID is invalid: ${artifactName}`);
  }
  if (!Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes <= 0) {
    throw new Error(`reviewed npm artifact is empty or has an invalid size: ${artifactName}`);
  }
  assertEqual(artifact.workflow_run?.id, Number(runId), "reviewed npm artifact run ID");
  assertEqual(artifact.workflow_run?.head_sha, expectedSha, "reviewed npm artifact source commit");
  assertEqual(artifact.workflow_run?.head_branch, "main", "reviewed npm artifact source branch");

  return { workflow, run, job, artifact, artifactName };
}

function assertStep(job, name, expectedConclusion) {
  const steps = Array.isArray(job.steps)
    ? job.steps.filter((step) => step.name === name)
    : [];
  if (steps.length !== 1) {
    throw new Error(`reviewed npm job must contain exactly one ${name} step`);
  }
  assertEqual(steps[0].conclusion, expectedConclusion, `${name} conclusion`);
}

function assertCompletePage(response, label) {
  const entries = response.jobs ?? response.artifacts;
  if (
    !Number.isSafeInteger(response.total_count) ||
    !Array.isArray(entries) ||
    response.total_count !== entries.length ||
    response.total_count > 100
  ) {
    throw new Error(`${label} response is incomplete or invalid`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected=${expected} actual=${actual}`);
  }
}
