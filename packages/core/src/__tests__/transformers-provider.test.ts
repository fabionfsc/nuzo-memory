import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLocalTransformersEmbeddingProvider,
  inspectLocalTransformersModel,
  localTransformersModel,
  localTransformersModelFiles,
  localTransformersProviderDescriptor,
  provisionLocalTransformersModel,
} from "../transformers-provider.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local Transformers embedding provider", () => {
  it("is inert until explicitly used and reports missing model state", async () => {
    const modelPath = temporaryModelPath();
    expect(inspectLocalTransformersModel(modelPath)).toMatchObject({ state: "missing" });
    const provider = createLocalTransformersEmbeddingProvider({ modelPath });
    expect(provider.descriptor).toEqual(localTransformersProviderDescriptor());
    await expect(provider.embedQuery("test")).rejects.toMatchObject({ code: "SEMANTIC_MODEL_MISSING" });
  });

  it("requires explicit network consent before provisioning", async () => {
    const fetch = vi.fn();
    await expect(provisionLocalTransformersModel({
      path: temporaryModelPath(),
      allowNetwork: false,
      fetch,
    })).rejects.toMatchObject({ code: "SEMANTIC_NETWORK_OPT_IN_REQUIRED" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a downloaded file before install when its checksum differs", async () => {
    const modelPath = temporaryModelPath();
    const fetch = vi.fn(async () => new Response("not the pinned model"));
    await expect(provisionLocalTransformersModel({
      path: modelPath,
      allowNetwork: true,
      fetch,
    })).rejects.toMatchObject({ code: "SEMANTIC_MODEL_CHECKSUM_FAILED" });
    expect(inspectLocalTransformersModel(modelPath)).toMatchObject({ state: "missing" });
  });

  it("rejects a manifest-matching model directory when file checksums differ", () => {
    const modelPath = temporaryModelPath();
    writeManifestMatchingFixture(modelPath);
    expect(inspectLocalTransformersModel(modelPath)).toMatchObject({
      state: "invalid",
      path: modelPath,
      reason: "One or more pinned semantic model files failed checksum validation.",
    });

    writeFileSync(join(modelPath, "nuzo-semantic-model.json"), "{}\n", "utf8");
    expect(inspectLocalTransformersModel(modelPath)).toMatchObject({ state: "invalid" });
  });

  it("does not skip repair for a tampered manifest-matching model", async () => {
    const modelPath = temporaryModelPath();
    writeManifestMatchingFixture(modelPath);
    const fetch = vi.fn();
    await expect(provisionLocalTransformersModel({ path: modelPath, allowNetwork: false, fetch }))
      .rejects.toMatchObject({ code: "SEMANTIC_NETWORK_OPT_IN_REQUIRED" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects symlinked pinned model files", () => {
    const modelPath = temporaryModelPath();
    writeManifestMatchingFixture(modelPath);
    rmSync(join(modelPath, localTransformersModelFiles[0]!.path));
    symlinkSync("/tmp/nuzo-not-a-real-model-file", join(modelPath, localTransformersModelFiles[0]!.path));

    expect(inspectLocalTransformersModel(modelPath)).toMatchObject({
      state: "invalid",
      reason: "Pinned semantic model file must not be a symlink.",
    });
  });

  it("returns an actionable provider or model error without attempting a model download", async () => {
    const modelPath = temporaryModelPath();
    writeManifestMatchingFixture(modelPath);
    const provider = createLocalTransformersEmbeddingProvider({ modelPath });
    await expect(provider.embedQuery("test")).rejects.toMatchObject({ code: "SEMANTIC_MODEL_INVALID" });
  });
});

function temporaryModelPath(): string {
  const directory = mkdtempSync(join(tmpdir(), "nuzo-transformers-provider-"));
  directories.push(directory);
  return join(directory, "model");
}

function writeManifestMatchingFixture(modelPath: string): void {
  mkdirSync(modelPath, { recursive: true, mode: 0o700 });
  for (const file of localTransformersModelFiles) {
    const path = join(modelPath, file.path);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, "", { mode: 0o600 });
  }
  writeFileSync(join(modelPath, "nuzo-semantic-model.json"), `${JSON.stringify({
    format: "nuzo-semantic-model",
    version: 1,
    model: localTransformersModel.id,
    revision: localTransformersModel.revision,
    dtype: localTransformersModel.dtype,
    dimensions: localTransformersModel.dimensions,
    files: localTransformersModelFiles,
  }, null, 2)}\n`, { mode: 0o600 });
}
