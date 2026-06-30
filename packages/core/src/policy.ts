import { invariant, NuzoMemoryError } from "./errors.js";
import type { PolicyEngine, SecretScanner } from "./ports.js";
import { memoryEventTypes, memoryKinds, type MemoryScope } from "./types.js";
import type {
  AuditEventFilter,
  ListMemoriesInput,
  MemoryRecord,
  RecallMemoriesInput,
  RememberMemoryInput,
  UpdateMemoryInput,
} from "./types.js";

export const memoryScopePattern = /^(user|project|agent|team):[A-Za-z0-9._~:/-]+$/;
export const memoryTagPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const memoryLimits = {
  actorLength: 256,
  contentLength: 8000,
  dateLength: 64,
  identifierLength: 256,
  importItems: 1000,
  queryLength: 2000,
  reasonLength: 1000,
  scopeLength: 256,
  sourceLength: 256,
  tags: 32,
} as const;

export interface DefaultPolicyEngineOptions {
  allowedScopes?: readonly MemoryScope[];
}

export class DefaultPolicyEngine implements PolicyEngine {
  private readonly allowedScopes: Set<MemoryScope> | null;

  constructor(
    private readonly secretScanner: SecretScanner,
    options: DefaultPolicyEngineOptions = {},
  ) {
    this.allowedScopes = options.allowedScopes === undefined
      ? null
      : new Set(options.allowedScopes);
  }

  async assertCanRemember(input: RememberMemoryInput): Promise<void> {
    invariant(
      input.content.trim().length > 0,
      "MEMORY_CONTENT_EMPTY",
      "Memory content cannot be empty.",
    );
    invariant(
      input.content.length <= memoryLimits.contentLength,
      "MEMORY_CONTENT_TOO_LONG",
      "Memory content is too long.",
      { maxLength: memoryLimits.contentLength },
    );
    invariant(
      memoryKinds.includes(input.kind),
      "MEMORY_KIND_UNSUPPORTED",
      "Memory kind is not supported.",
      { kind: input.kind },
    );
    assertScope(input.scope);
    this.assertScopeAllowed(input.scope);
    invariant(
      input.source.trim().length > 0,
      "MEMORY_SOURCE_EMPTY",
      "Memory source cannot be empty.",
    );
    invariant(
      input.source.length <= memoryLimits.sourceLength,
      "MEMORY_SOURCE_TOO_LONG",
      "Memory source is too long.",
      { maxLength: memoryLimits.sourceLength },
    );

    const confidence = input.confidence ?? 1;
    invariant(
      confidence >= 0 && confidence <= 1,
      "MEMORY_CONFIDENCE_INVALID",
      "Memory confidence must be between 0 and 1.",
      { confidence },
    );

    const tags = input.tags ?? [];
    invariant(
      tags.length <= memoryLimits.tags,
      "MEMORY_TAG_LIMIT_EXCEEDED",
      "Memory has too many tags.",
      { maxTags: memoryLimits.tags },
    );
    for (const tag of tags) {
      assertTag(tag);
    }

    const secretScan = await this.secretScanner.scan(input.content);
    invariant(secretScan.ok, "MEMORY_SECRET_DETECTED", "Memory content looks sensitive.", {
      findings: secretScan.findings,
    });
  }

  async assertCanUpdate(input: UpdateMemoryInput, current: MemoryRecord): Promise<void> {
    this.assertScopeAllowed(current.scope);
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

  async assertCanForget(_input: { id: string }, current: MemoryRecord): Promise<void> {
    this.assertScopeAllowed(current.scope);
  }

  async assertCanRecall(input: RecallMemoriesInput): Promise<void> {
    invariant(input.query.trim().length > 0, "RECALL_QUERY_EMPTY", "Recall query cannot be empty.");
    invariant(
      input.query.length <= memoryLimits.queryLength,
      "RECALL_QUERY_TOO_LONG",
      "Recall query is too long.",
      { maxLength: memoryLimits.queryLength },
    );
    assertScope(input.scope);
    this.assertScopeAllowed(input.scope);
    if (input.includeGlobal === true) {
      this.assertScopeAllowed("user:default");
    }

    const limit = input.limit ?? 8;
    invariant(limit > 0 && limit <= 50, "RECALL_LIMIT_INVALID", "Recall limit must be 1-50.", {
      limit,
    });
  }

  async assertCanList(input: ListMemoriesInput): Promise<void> {
    if (input.scope !== undefined) {
      assertScope(input.scope);
      this.assertScopeAllowed(input.scope);
    } else if (this.allowedScopes !== null) {
      throw new NuzoMemoryError(
        "MEMORY_SCOPE_REQUIRED",
        "A scope is required for this restricted memory session.",
      );
    }
    const tags = input.tags ?? [];
    invariant(
      tags.length <= memoryLimits.tags,
      "MEMORY_TAG_LIMIT_EXCEEDED",
      "Memory filter has too many tags.",
      { maxTags: memoryLimits.tags },
    );
    for (const tag of tags) {
      assertTag(tag);
    }
    if (input.limit !== undefined) {
      invariant(input.limit > 0 && input.limit <= 1000, "MEMORY_LIST_LIMIT_INVALID", "List limit must be 1-1000.", {
        limit: input.limit,
      });
    }
    if (input.cursor !== undefined) {
      invariant(input.cursor.trim().length > 0, "MEMORY_CURSOR_INVALID", "Memory pagination cursor is invalid.");
      invariant(input.cursor.length <= memoryLimits.identifierLength * 4, "MEMORY_CURSOR_INVALID", "Memory pagination cursor is invalid.");
    }
  }

  async assertCanAudit(input: AuditEventFilter, currentMemory?: MemoryRecord | null): Promise<void> {
    if (input.scope !== undefined) {
      assertScope(input.scope);
      this.assertScopeAllowed(input.scope);
    } else if (currentMemory !== undefined && currentMemory !== null) {
      this.assertScopeAllowed(currentMemory.scope);
    } else if (this.allowedScopes !== null) {
      throw new NuzoMemoryError(
        "MEMORY_SCOPE_REQUIRED",
        "A scope is required for this restricted memory session.",
      );
    }

    if (input.actor !== undefined) {
      invariant(input.actor.trim().length > 0, "MEMORY_ACTOR_EMPTY", "Memory actor cannot be empty.");
      invariant(input.actor.length <= memoryLimits.actorLength, "MEMORY_ACTOR_INVALID", "Memory actor is too long.", {
        maxLength: memoryLimits.actorLength,
      });
    }

    for (const eventType of input.eventTypes ?? []) {
      invariant(
        memoryEventTypes.includes(eventType),
        "MEMORY_AUDIT_EVENT_TYPE_INVALID",
        "Audit event type is not supported.",
        { eventType },
      );
    }

    if (input.limit !== undefined) {
      invariant(input.limit > 0 && input.limit <= 200, "MEMORY_AUDIT_LIMIT_INVALID", "Audit limit must be 1-200.", {
        limit: input.limit,
      });
    }

    if (input.since !== undefined) {
      assertValidDate(input.since, "since");
    }

    if (input.until !== undefined) {
      assertValidDate(input.until, "until");
    }

    if (input.since !== undefined && input.until !== undefined) {
      invariant(
        input.since.getTime() <= input.until.getTime(),
        "MEMORY_AUDIT_TIME_RANGE_INVALID",
        "Audit since must be earlier than or equal to until.",
      );
    }
  }

  private assertScopeAllowed(scope: MemoryScope): void {
    if (this.allowedScopes === null) {
      return;
    }
    if (!this.allowedScopes.has(scope)) {
      throw new NuzoMemoryError("MEMORY_SCOPE_FORBIDDEN", "Memory scope is not authorized.", {
        scope,
      });
    }
  }
}

function assertScope(scope: MemoryScope): void {
  invariant(
    scope.length <= memoryLimits.scopeLength && memoryScopePattern.test(scope),
    "MEMORY_SCOPE_INVALID",
    "Memory scope is invalid.",
    { scope, maxLength: memoryLimits.scopeLength },
  );
}

function assertTag(tag: string): void {
  invariant(memoryTagPattern.test(tag), "MEMORY_TAG_INVALID", "Memory tag is invalid.", {
    tag,
  });
}

function assertValidDate(date: Date, field: string): void {
  invariant(!Number.isNaN(date.getTime()), "MEMORY_DATE_INVALID", "Memory date is invalid.", {
    field,
  });
}
