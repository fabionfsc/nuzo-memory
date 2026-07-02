import type { Command } from "commander";
import {
  clearSemanticIndex,
  createLocalTransformersEmbeddingProvider,
  embeddingProviderFingerprint,
  inspectLocalTransformersModel,
  inspectSemanticIndex,
  localTransformersProviderDescriptor,
  NuzoMemoryError,
  provisionLocalTransformersModel,
  rebuildSemanticIndex,
  semanticIndexPathFor,
} from "@nuzo/memory-core";
import type { CliIO } from "./cli-io.js";
import { withErrorHandling } from "./errors.js";
import { createService, openDatabase, resolveRuntimeConfig, type GlobalOptions } from "./runtime.js";

export function registerSemanticCommands(memory: Command, io: CliIO): void {
  const semantic = memory.command("semantic").description("Manage the optional derived semantic index and local model.");

  semantic
    .command("status")
    .description("Inspect model and derived-index state without loading the model.")
    .option("--model-path <path>", "Pinned local semantic model directory.")
    .option("--json", "Print JSON output.", false)
    .action(withErrorHandling(io, async (commandOptions: { modelPath?: string; json: boolean }) => {
      const runtime = resolveRuntimeConfig(memory.opts<GlobalOptions>());
      const database = openDatabase(runtime.storePath);
      try {
        const model = inspectLocalTransformersModel(commandOptions.modelPath);
        const index = await inspectSemanticIndex(
          semanticIndexPathFor(runtime.storePath),
          embeddingProviderFingerprint(localTransformersProviderDescriptor()),
          database,
        );
        const output = { model, index };
        if (commandOptions.json) io.stdout(JSON.stringify(output, null, 2));
        else {
          io.stdout(`Model: ${model.state} (${model.path})`);
          io.stdout(`Index: ${index.state} (${index.path})`);
          io.stdout(`Indexed: ${index.indexedMemories}/${index.activeMemories}`);
        }
      } finally {
        database.close();
      }
    }));

  semantic
    .command("provision")
    .description("Download and verify the pinned local model after explicit consent.")
    .option("--model-path <path>", "Pinned local semantic model directory.")
    .option("--allow-network", "Allow this command to download the pinned public model.", false)
    .option("--yes", "Confirm the model download.", false)
    .option("--json", "Print JSON output.", false)
    .action(withErrorHandling(io, async (commandOptions: {
      modelPath?: string;
      allowNetwork: boolean;
      yes: boolean;
      json: boolean;
    }) => {
      if (!commandOptions.yes) {
        throw new NuzoMemoryError("SEMANTIC_PROVISION_CONFIRMATION_REQUIRED", "Model provisioning requires --yes.");
      }
      const result = await provisionLocalTransformersModel({
        ...(commandOptions.modelPath === undefined ? {} : { path: commandOptions.modelPath }),
        allowNetwork: commandOptions.allowNetwork,
      });
      if (commandOptions.json) io.stdout(JSON.stringify(result, null, 2));
      else {
        io.stdout(result.downloaded ? "Semantic model provisioned" : "Semantic model already ready");
        io.stdout(`Path: ${result.path}`);
        io.stdout(`Files: ${result.files}`);
        io.stdout(`Bytes: ${result.bytes}`);
      }
    }));

  semantic
    .command("rebuild")
    .description("Rebuild the derived semantic sidecar from active canonical memory.")
    .option("--model-path <path>", "Pinned local semantic model directory.")
    .option("--json", "Print JSON output.", false)
    .action(withErrorHandling(io, async (commandOptions: { modelPath?: string; json: boolean }) => {
      const runtime = resolveRuntimeConfig(memory.opts<GlobalOptions>());
      const database = openDatabase(runtime.storePath);
      const provider = createLocalTransformersEmbeddingProvider({
        ...(commandOptions.modelPath === undefined ? {} : { modelPath: commandOptions.modelPath }),
      });
      try {
        const result = await rebuildSemanticIndex({
          path: semanticIndexPathFor(runtime.storePath),
          provider,
          memories: await createService(database).list({ includeArchived: false }),
        });
        if (commandOptions.json) io.stdout(JSON.stringify(result, null, 2));
        else {
          io.stdout("Semantic index rebuilt");
          io.stdout(`Path: ${result.path}`);
          io.stdout(`Indexed memories: ${result.indexedMemories}`);
        }
      } finally {
        await provider.dispose?.();
        database.close();
      }
    }));

  semantic
    .command("clear")
    .description("Delete only the derived semantic sidecar.")
    .option("--yes", "Confirm deletion of the derived sidecar.", false)
    .action(withErrorHandling(io, async (commandOptions: { yes: boolean }) => {
      if (!commandOptions.yes) {
        throw new NuzoMemoryError("SEMANTIC_CLEAR_CONFIRMATION_REQUIRED", "Clearing the semantic sidecar requires --yes.");
      }
      const runtime = resolveRuntimeConfig(memory.opts<GlobalOptions>());
      const removed = clearSemanticIndex(semanticIndexPathFor(runtime.storePath));
      io.stdout(removed ? "Semantic index cleared" : "Semantic index already absent");
    }));
}
