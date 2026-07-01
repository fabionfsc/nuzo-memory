# Optional Semantics

Nuzo can add one local semantic candidate to normal FTS recall. It is
an explicit, optional workflow. Existing installs, CLI calls, MCP calls, and
host lifecycle hooks remain FTS-only.

## Install The Optional Runtime

Normal users still install only `@nuzo/memory`. To use the selected local
provider, install its exact optional peer alongside Nuzo:

```bash
npm install --global \
  @nuzo/memory@0.9.1 \
  @huggingface/transformers@4.2.0
```

This installs the inference runtime but not the model. FTS commands do not
import or initialize it.

## Provision The Pinned Model

Model provisioning is the only semantic command allowed to use network:

```bash
nuzo memory semantic provision --allow-network --yes
```

The command downloads five files from one pinned Hugging Face revision,
validates committed SHA-256 digests, and installs them with owner-only
permissions. The q4 model uses approximately 53 MiB. If a complete pinned
model is already ready, the command performs no download.

`semantic status`, `semantic provision`, and semantic provider loading all
verify the pinned model files before reporting `ready` or skipping repair.
Manifest metadata and filenames are not sufficient: truncated files, altered
digests, unreadable files, missing files, and symlinked model files are treated
as invalid.

Neither index rebuild nor recall can download model or runtime assets.

## Build The Derived Index

Inspect state, then build the sidecar from active canonical memory:

```bash
nuzo memory semantic status
nuzo memory semantic rebuild
nuzo memory semantic status
```

The sidecar is `memories.semantic.sqlite` beside the canonical
`memories.sqlite`. Rebuild embeds canonical content and tags in bounded
batches, writes a temporary sidecar, validates it, and replaces the completed
sidecar atomically.

Remember, update, import, archive, delete, and explicit recall-usage recording
can make the sidecar stale. These canonical operations still succeed without
calling the provider. Run `semantic rebuild` again when status reports stale.

## Recall

Recommended opt-in mode:

```bash
nuzo memory recall "How do we publish verifiable packages?" --mode hybrid
```

Hybrid recall fuses the bounded FTS list with the strongest local semantic
candidate. If the model or sidecar is missing, stale, incompatible, or failed,
the command returns FTS results and writes a concise fallback diagnostic to
stderr.

For scripts:

```bash
nuzo memory recall "package provenance" --mode hybrid --json
```

The JSON object includes `results` and `diagnostics`, including fallback even
when there are no results.

Semantic-only mode is stricter and is not the recommended general default:

```bash
nuzo memory recall "package provenance" --mode semantic
nuzo memory recall "package provenance" --mode semantic --semantic-fallback fts
```

Without explicit `--semantic-fallback fts`, semantic-only mode errors when the
semantic path is unavailable. It also has a higher noise rate than the
conservative hybrid profile in the `0.7.0` benchmark.

## MCP

After the local operator installs, provisions, and rebuilds the same configured
store, an MCP caller may add:

```json
{
  "retrieval_mode": "hybrid"
}
```

The response adds `retrieval.requested_mode`, `effective_mode`, and
`semantic_fallback_code`. MCP cannot provision models or rebuild/clear the
sidecar. Lifecycle hooks remain FTS-only so session startup does not load a
model unexpectedly.

## Clear And Recover

Delete only the derived sidecar:

```bash
nuzo memory semantic clear --yes
```

This is safe to repeat and cannot delete canonical memory or audit history.
Normal FTS recall continues immediately. Rebuild later to opt in again.

JSON/Markdown exports and backups exclude vectors, model files, and provider
metadata. After restoring canonical memory, provision the model if necessary
and rebuild the sidecar.

## Privacy And Resource Boundary

- Provisioning contacts Hugging Face for the pinned public files; it sends no
  memory or query content.
- Rebuild and recall use local-files-only inference with remote models disabled.
- Vectors are sensitive derived data with owner-only file permissions.
- The provider uses CPU, native ONNX Runtime, approximately 53 MiB of model
  storage, and additional process memory only when semantic work is requested.
- On the release-gate Linux host, the optional Transformers.js dependency tree
  occupied approximately 660 MiB after installation. A cold one-memory hybrid
  CLI process completed in 0.91 seconds with approximately 182 MiB peak RSS.
  Package-manager layout, CPU, and platform binaries make these measurements
  environment-specific; inspect local disk and memory constraints before
  enabling the provider.
- FTS remains the low-resource, inspectable default and recovery path.
