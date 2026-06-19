import { invariant } from "./errors.js";
import type { PolicyEngine, SecretScanner } from "./ports.js";
import { memoryKinds, type MemoryScope } from "./types.js";
import type {
  ListMemoriesInput,
  MemoryRecord,
  RecallMemoriesInput,
  RememberMemoryInput,
  UpdateMemoryInput,
} from "./types.js";

const scopePattern = /^(user|project|agent|team):[A-Za-z0-9._~:/-]+$/;
const tagPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export class DefaultPolicyEngine implements PolicyEngine {
  constructor(private readonly secretScanner: SecretScanner) {}

  async assertCanRemember(input: RememberMemoryInput): Promise<void> {
    invariant(
      input.content.trim().length > 0,
      "MEMORY_CONTENT_EMPTY",
      "Memory content cannot be empty.",
    );
    invariant(
      input.content.length <= 8000,
      "MEMORY_CONTENT_TOO_LONG",
      "Memory content is too long.",
      { maxLength: 8000 },
    );
    invariant(
      memoryKinds.includes(input.kind),
      "MEMORY_KIND_UNSUPPORTED",
      "Memory kind is not supported.",
      { kind: input.kind },
    );
    assertScope(input.scope);
    invariant(
      input.source.trim().length > 0,
      "MEMORY_SOURCE_EMPTY",
      "Memory source cannot be empty.",
    );

    const confidence = input.confidence ?? 1;
    invariant(
      confidence >= 0 && confidence <= 1,
      "MEMORY_CONFIDENCE_INVALID",
      "Memory confidence must be between 0 and 1.",
      { confidence },
    );

    for (const tag of input.tags ?? []) {
      assertTag(tag);
    }

    const secretScan = await this.secretScanner.scan(input.content);
    invariant(secretScan.ok, "MEMORY_SECRET_DETECTED", "Memory content looks sensitive.", {
      findings: secretScan.findings,
    });
  }

  async assertCanUpdate(input: UpdateMemoryInput, current: MemoryRecord): Promise<void> {
    await this.assertCanRemember({
      content: input.content ?? current.content,
      kind: input.kind ?? current.kind,
      scope: input.scope ?? current.scope,
      tags: input.tags ?? current.tags,
      source: current.source,
      confidence: input.confidence ?? current.confidence,
    });
    invariant(input.actor.trim().length > 0, "MEMORY_ACTOR_EMPTY", "Memory actor cannot be empty.");
  }

  async assertCanRecall(input: RecallMemoriesInput): Promise<void> {
    invariant(input.query.trim().length > 0, "RECALL_QUERY_EMPTY", "Recall query cannot be empty.");
    assertScope(input.scope);

    const limit = input.limit ?? 8;
    invariant(limit > 0 && limit <= 50, "RECALL_LIMIT_INVALID", "Recall limit must be 1-50.", {
      limit,
    });
  }

  async assertCanList(input: ListMemoriesInput): Promise<void> {
    if (input.scope !== undefined) {
      assertScope(input.scope);
    }
    for (const tag of input.tags ?? []) {
      assertTag(tag);
    }
  }
}

function assertScope(scope: MemoryScope): void {
  invariant(scopePattern.test(scope), "MEMORY_SCOPE_INVALID", "Memory scope is invalid.", {
    scope,
  });
}

function assertTag(tag: string): void {
  invariant(tagPattern.test(tag), "MEMORY_TAG_INVALID", "Memory tag is invalid.", {
    tag,
  });
}
