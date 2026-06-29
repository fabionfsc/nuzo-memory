import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { NuzoMemoryError } from "./errors.js";
import type { EmbeddingProvider, EmbeddingProviderDescriptor } from "./ports.js";

export const localTransformersModel = {
  id: "onnx-community/all-MiniLM-L6-v2-ONNX",
  revision: "aff7a1dc4e8a1ea593e6ea21e95c22ef0a25966f",
  dtype: "q4",
  dimensions: 384,
  packageName: "@huggingface/transformers",
  packageVersion: "4.2.0",
} as const;

export const localTransformersModelFiles = [
  { path: "config.json", sha256: "fe5da868b77bdb104140822a5af0837cb6450ad6de8ff3dfcc8dd44ddd3e3ae7" },
  { path: "tokenizer.json", sha256: "07805d116826679de90b4edeb2222269c4b8753bc0981be4399f732b2708e904" },
  { path: "tokenizer_config.json", sha256: "e10bb633ba0d7f69ed342ae7de607f36b39ce53b455fbda69c71700bf57e6f66" },
  { path: "onnx/model_q4.onnx", sha256: "e4dcb918111189b7686147e309379832fce83d4ecbf17c395961749b5788c786" },
  { path: "onnx/model_q4.onnx_data", sha256: "56fb7a55115e900196115a74e399beb45c2f41ae00b99525d46fb52935c4ee2a" },
] as const;

const manifestName = "nuzo-semantic-model.json";

export interface LocalTransformersModelManifest {
  format: "nuzo-semantic-model";
  version: 1;
  model: typeof localTransformersModel.id;
  revision: typeof localTransformersModel.revision;
  dtype: typeof localTransformersModel.dtype;
  dimensions: typeof localTransformersModel.dimensions;
  files: Array<{ path: string; sha256: string }>;
}

export interface LocalTransformersModelStatus {
  state: "missing" | "ready" | "invalid";
  path: string;
  reason: string;
}

export interface ProvisionLocalTransformersModelInput {
  path?: string;
  allowNetwork: boolean;
  fetch?: typeof globalThis.fetch;
}

export interface ProvisionLocalTransformersModelResult {
  path: string;
  downloaded: boolean;
  files: number;
  bytes: number;
}

export interface LocalTransformersProviderOptions {
  modelPath?: string;
}

interface FeatureExtractionOutput {
  dims: number[];
  tolist(): unknown;
}

interface FeatureExtractor {
  (texts: string[], options: { pooling: "mean"; normalize: true }): Promise<FeatureExtractionOutput>;
  dispose(): Promise<void>;
}

interface TransformersModule {
  env: { allowRemoteModels: boolean; allowLocalModels: boolean };
  pipeline(
    task: "feature-extraction",
    model: string,
    options: { dtype: "q4"; local_files_only: true },
  ): Promise<FeatureExtractor>;
}

export function defaultLocalTransformersModelPath(): string {
  return join(
    homedir(),
    ".nuzo",
    "models",
    `all-MiniLM-L6-v2-ONNX-${localTransformersModel.revision.slice(0, 12)}-q4`,
  );
}

export function localTransformersProviderDescriptor(): EmbeddingProviderDescriptor {
  return {
    id: "transformers-local",
    model: localTransformersModel.id,
    revision: `${localTransformersModel.revision}-${localTransformersModel.dtype}`,
    dimensions: localTransformersModel.dimensions,
    network: "none",
  };
}

export function inspectLocalTransformersModel(
  path = defaultLocalTransformersModelPath(),
): LocalTransformersModelStatus {
  const modelPath = resolve(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(modelPath, manifestName), "utf8"));
  } catch (error) {
    if (isMissingFile(error)) {
      return { state: "missing", path: modelPath, reason: "Pinned local semantic model is not provisioned." };
    }
    return { state: "invalid", path: modelPath, reason: "Semantic model manifest is unreadable." };
  }
  if (!isExpectedManifest(parsed)) {
    return { state: "invalid", path: modelPath, reason: "Semantic model manifest does not match the pinned profile." };
  }
  try {
    for (const file of localTransformersModelFiles) {
      if (!statSync(join(modelPath, file.path)).isFile()) {
        return { state: "invalid", path: modelPath, reason: `Semantic model file is invalid: ${file.path}.` };
      }
    }
  } catch (error) {
    return {
      state: "invalid",
      path: modelPath,
      reason: isMissingFile(error)
        ? "One or more pinned semantic model files are missing."
        : "Semantic model files cannot be inspected.",
    };
  }
  return { state: "ready", path: modelPath, reason: "Pinned local semantic model is ready." };
}

export async function provisionLocalTransformersModel(
  input: ProvisionLocalTransformersModelInput,
): Promise<ProvisionLocalTransformersModelResult> {
  const modelPath = resolve(input.path ?? defaultLocalTransformersModelPath());
  const current = inspectLocalTransformersModel(modelPath);
  if (current.state === "ready") {
    return { path: modelPath, downloaded: false, files: localTransformersModelFiles.length, bytes: totalModelBytes(modelPath) };
  }
  if (input.allowNetwork !== true) {
    throw new NuzoMemoryError(
      "SEMANTIC_NETWORK_OPT_IN_REQUIRED",
      "Provisioning the pinned semantic model requires explicit network opt-in.",
      { model: localTransformersModel.id, revision: localTransformersModel.revision },
    );
  }
  const fetchImplementation = input.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function") {
    throw new NuzoMemoryError("SEMANTIC_MODEL_DOWNLOAD_FAILED", "This runtime does not provide fetch for model provisioning.");
  }

  const parent = dirname(modelPath);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  chmodSync(parent, 0o700);
  const temporaryPath = join(parent, `.nuzo-semantic-model-${randomUUID()}`);
  mkdirSync(temporaryPath, { mode: 0o700 });
  let bytes = 0;
  try {
    for (const file of localTransformersModelFiles) {
      const target = join(temporaryPath, file.path);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      const url = modelDownloadUrl(file.path);
      const response = await fetchImplementation(url, { redirect: "follow" });
      if (!response.ok) {
        throw new NuzoMemoryError(
          "SEMANTIC_MODEL_DOWNLOAD_FAILED",
          "Pinned semantic model download failed.",
          { file: file.path, status: response.status },
        );
      }
      const content = Buffer.from(await response.arrayBuffer());
      const digest = createHash("sha256").update(content).digest("hex");
      if (digest !== file.sha256) {
        throw new NuzoMemoryError(
          "SEMANTIC_MODEL_CHECKSUM_FAILED",
          "Pinned semantic model checksum validation failed.",
          { file: file.path },
        );
      }
      writeFileSync(target, content, { mode: 0o600, flag: "wx" });
      chmodSync(target, 0o600);
      bytes += content.length;
    }
    writeFileSync(
      join(temporaryPath, manifestName),
      `${JSON.stringify(expectedManifest(), null, 2)}\n`,
      { mode: 0o600, flag: "wx" },
    );
    replaceModelDirectory(temporaryPath, modelPath);
    return { path: modelPath, downloaded: true, files: localTransformersModelFiles.length, bytes };
  } catch (error) {
    rmSync(temporaryPath, { recursive: true, force: true });
    if (error instanceof NuzoMemoryError) throw error;
    throw new NuzoMemoryError(
      "SEMANTIC_MODEL_DOWNLOAD_FAILED",
      "Pinned semantic model provisioning failed.",
      { cause: errorMessage(error) },
    );
  }
}

export function createLocalTransformersEmbeddingProvider(
  options: LocalTransformersProviderOptions = {},
): EmbeddingProvider {
  const modelPath = resolve(options.modelPath ?? defaultLocalTransformersModelPath());
  let extractorPromise: Promise<FeatureExtractor> | null = null;
  const load = async (): Promise<FeatureExtractor> => {
    const modelStatus = inspectLocalTransformersModel(modelPath);
    if (modelStatus.state !== "ready") {
      throw new NuzoMemoryError(
        modelStatus.state === "missing" ? "SEMANTIC_MODEL_MISSING" : "SEMANTIC_MODEL_INVALID",
        modelStatus.reason,
        { path: modelPath },
      );
    }
    if (!extractorPromise) {
      extractorPromise = loadExtractor(modelPath).catch((error) => {
        extractorPromise = null;
        throw error;
      });
    }
    return extractorPromise;
  };
  const embed = async (texts: readonly string[]): Promise<readonly (readonly number[])[]> => {
    const extractor = await load();
    let output: FeatureExtractionOutput;
    try {
      output = await extractor([...texts], { pooling: "mean", normalize: true });
    } catch (error) {
      throw new NuzoMemoryError("SEMANTIC_PROVIDER_FAILED", "Local semantic model inference failed.", { cause: errorMessage(error) });
    }
    const values = output.tolist();
    if (!Array.isArray(values) || !values.every((vector) => Array.isArray(vector))) {
      throw new NuzoMemoryError("SEMANTIC_PROVIDER_INVALID", "Local semantic model returned an invalid tensor.");
    }
    return values as number[][];
  };

  return {
    descriptor: localTransformersProviderDescriptor(),
    embedDocuments: embed,
    async embedQuery(text) {
      const vectors = await embed([text]);
      return vectors[0]!;
    },
    async dispose() {
      if (extractorPromise) {
        const extractor = await extractorPromise;
        extractorPromise = null;
        await extractor.dispose();
      }
    },
  };
}

async function loadExtractor(modelPath: string): Promise<FeatureExtractor> {
  const packageName: string = localTransformersModel.packageName;
  let transformers: TransformersModule;
  try {
    transformers = await import(packageName) as TransformersModule;
  } catch (error) {
    if (isMissingPackage(error)) {
      throw new NuzoMemoryError(
        "SEMANTIC_PROVIDER_MISSING",
        `Install ${localTransformersModel.packageName}@${localTransformersModel.packageVersion} to use the local semantic provider.`,
      );
    }
    throw new NuzoMemoryError("SEMANTIC_PROVIDER_FAILED", "Local semantic provider could not be loaded.", { cause: errorMessage(error) });
  }
  transformers.env.allowRemoteModels = false;
  transformers.env.allowLocalModels = true;
  verifyModelChecksums(modelPath);
  try {
    return await transformers.pipeline("feature-extraction", modelPath, {
      dtype: localTransformersModel.dtype,
      local_files_only: true,
    });
  } catch (error) {
    throw new NuzoMemoryError("SEMANTIC_PROVIDER_FAILED", "Pinned local semantic model could not be loaded.", { cause: errorMessage(error) });
  }
}

function verifyModelChecksums(modelPath: string): void {
  for (const file of localTransformersModelFiles) {
    let content: Buffer;
    try {
      content = readFileSync(join(modelPath, file.path));
    } catch (error) {
      throw new NuzoMemoryError("SEMANTIC_MODEL_INVALID", "Pinned semantic model file cannot be read.", { file: file.path, cause: errorMessage(error) });
    }
    const digest = createHash("sha256").update(content).digest("hex");
    if (digest !== file.sha256) {
      throw new NuzoMemoryError("SEMANTIC_MODEL_CHECKSUM_FAILED", "Pinned semantic model checksum validation failed.", { file: file.path });
    }
  }
}

function expectedManifest(): LocalTransformersModelManifest {
  return {
    format: "nuzo-semantic-model",
    version: 1,
    model: localTransformersModel.id,
    revision: localTransformersModel.revision,
    dtype: localTransformersModel.dtype,
    dimensions: localTransformersModel.dimensions,
    files: localTransformersModelFiles.map((file) => ({ ...file })),
  };
}

function isExpectedManifest(value: unknown): value is LocalTransformersModelManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const manifest = value as Partial<LocalTransformersModelManifest>;
  return manifest.format === "nuzo-semantic-model" &&
    manifest.version === 1 &&
    manifest.model === localTransformersModel.id &&
    manifest.revision === localTransformersModel.revision &&
    manifest.dtype === localTransformersModel.dtype &&
    manifest.dimensions === localTransformersModel.dimensions &&
    Array.isArray(manifest.files) &&
    manifest.files.length === localTransformersModelFiles.length &&
    localTransformersModelFiles.every((expected, index) => {
      const actual = manifest.files?.[index];
      return actual?.path === expected.path && actual.sha256 === expected.sha256;
    });
}

function modelDownloadUrl(relativePath: string): string {
  const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
  return `https://huggingface.co/${localTransformersModel.id}/resolve/${localTransformersModel.revision}/${encodedPath}`;
}

function replaceModelDirectory(temporaryPath: string, modelPath: string): void {
  const backupPath = `${modelPath}.backup-${randomUUID()}`;
  let hasBackup = false;
  try {
    try {
      renameSync(modelPath, backupPath);
      hasBackup = true;
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
    renameSync(temporaryPath, modelPath);
    if (hasBackup) rmSync(backupPath, { recursive: true, force: true });
  } catch (error) {
    if (hasBackup) {
      try {
        renameSync(backupPath, modelPath);
      } catch {
        // The original failure is more actionable; the backup path remains in its details below.
      }
    }
    throw new NuzoMemoryError("SEMANTIC_MODEL_INSTALL_FAILED", "Could not replace the local semantic model directory.", { backupPath: hasBackup ? backupPath : null, cause: errorMessage(error) });
  }
}

function totalModelBytes(modelPath: string): number {
  return localTransformersModelFiles.reduce((total, file) => total + statSync(join(modelPath, file.path)).size, 0);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isMissingPackage(error: unknown): boolean {
  return error instanceof Error && "code" in error &&
    (error.code === "ERR_MODULE_NOT_FOUND" || error.code === "MODULE_NOT_FOUND");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
