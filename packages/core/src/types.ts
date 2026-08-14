export type MemoryKind =
  | "preference"
  | "project_decision"
  | "fact"
  | "instruction"
  | "note";

export const memoryKinds = [
  "preference",
  "project_decision",
  "fact",
  "instruction",
  "note",
] as const satisfies readonly MemoryKind[];

export type MemoryProvenanceKind =
  | "conversation"
  | "file"
  | "import"
  | "cli"
  | "mcp";

export const memoryProvenanceKinds = [
  "conversation",
  "file",
  "import",
  "cli",
  "mcp",
] as const satisfies readonly MemoryProvenanceKind[];

export type MemoryConfidenceState =
  | "observed"
  | "inferred"
  | "user_confirmed"
  | "needs_review"
  | "deprecated";

export const memoryConfidenceStates = [
  "observed",
  "inferred",
  "user_confirmed",
  "needs_review",
  "deprecated",
] as const satisfies readonly MemoryConfidenceState[];

export type MemoryRelationType =
  | "supersedes"
  | "conflicts_with"
  | "duplicate_of"
  | "related_to";

export const memoryRelationTypes = [
  "supersedes",
  "conflicts_with",
  "duplicate_of",
  "related_to",
] as const satisfies readonly MemoryRelationType[];

export type MemoryScope =
  | `user:${string}`
  | `project:${string}`
  | `agent:${string}`
  | `team:${string}`;

export interface MemoryProvenance {
  kind: MemoryProvenanceKind;
  host?: string;
  surface?: string;
  path?: string;
  line?: number;
  thread_id?: string;
  action?: string;
  reason?: string;
}

export interface MemoryRecord {
  id: string;
  revision: number;
  scope: MemoryScope;
  kind: MemoryKind;
  content: string;
  tags: string[];
  source: string;
  confidence: number;
  confidenceState: MemoryConfidenceState | null;
  provenance: MemoryProvenance | null;
  reviewAfter: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  archivedAt: Date | null;
}

export interface MemoryEvent {
  id: string;
  memoryId: string | null;
  eventType: MemoryEventType;
  actor: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export type MemoryEventType =
  | "memory.created"
  | "memory.updated"
  | "memory.archived"
  | "memory.deleted"
  | "memory.imported"
  | "memory.exported"
  | "memory.recalled"
  | "memory.scope.rehomed"
  | "memory.challenged"
  | "memory.relation.created"
  | "memory.relation.deleted";

export const memoryEventTypes = [
  "memory.created",
  "memory.updated",
  "memory.archived",
  "memory.deleted",
  "memory.imported",
  "memory.exported",
  "memory.recalled",
  "memory.scope.rehomed",
  "memory.challenged",
  "memory.relation.created",
  "memory.relation.deleted",
] as const satisfies readonly MemoryEventType[];

export interface AuditEventFilter {
  memoryId?: string;
  eventTypes?: MemoryEvent["eventType"][];
  actor?: string;
  scope?: MemoryScope;
  since?: Date;
  until?: Date;
  limit?: number;
}

export interface RememberMemoryInput {
  content: string;
  kind: MemoryKind;
  scope: MemoryScope;
  tags?: string[];
  source: string;
  /** Audit surface that performed the write. Defaults to `core`. */
  actor?: string;
  confidence?: number;
  confidenceState?: MemoryConfidenceState | null;
  provenance?: MemoryProvenance | null;
  reviewAfter?: Date | null;
  expiresAt?: Date | null;
}

export interface SuggestCaptureInput extends RememberMemoryInput {
  reason: string;
  relationshipMode?: CaptureRelationshipMode;
}

export type CaptureRelationshipMode = "exact" | "bounded";

export type CaptureRelationship =
  | "exact_duplicate"
  | "update_candidate"
  | "related"
  | "independent"
  | "uncertain";

export interface CaptureSuggestionDraft {
  content: string;
  kind: MemoryKind;
  scope: MemoryScope;
  tags: string[];
  source: string;
  confidence: number;
  confidenceState: MemoryConfidenceState | null;
  provenance: MemoryProvenance | null;
  reviewAfter: Date | null;
  expiresAt: Date | null;
  reason: string;
}

export interface CaptureSuggestionResult {
  status: "ready" | "duplicate" | "review";
  memoryWrites: false;
  requiresConfirmation: true;
  draft: CaptureSuggestionDraft;
  duplicate: MemoryRecord | null;
  relationshipMode?: "bounded";
  relationship?: CaptureRelationship;
  relationshipEvidence?: CaptureRelationshipEvidence;
}

export interface CaptureRelationshipCandidate {
  memory: MemoryRecord;
  matchedTerms: string[];
  matchedTags: string[];
  reason: string;
}

export interface CaptureRelationshipEvidence {
  version: 1;
  primaryMemoryId: string | null;
  candidateLimit: 20;
  returnedLimit: 3;
  evaluatedCount: number;
  searchExhaustive: boolean;
  evidenceTruncated: boolean;
  reason: string;
  candidates: CaptureRelationshipCandidate[];
}

export type ConfirmCaptureDecision =
  | "create"
  | "update"
  | "keep_separate"
  | "clarify"
  | "reject";

export interface ConfirmCaptureInput extends RememberMemoryInput {
  decision: ConfirmCaptureDecision;
  reason: string;
  confirm?: boolean;
  actor: string;
  targetMemoryId?: string;
  expectedRevision?: number;
}

export interface ConfirmCaptureResult {
  decision: ConfirmCaptureDecision;
  status: "created" | "updated" | "skipped" | "needs_clarification";
  memoryWrites: boolean;
  memory: MemoryRecord | null;
  requiresConfirmation: false;
  reason: string;
}

export interface RecallMemoriesInput {
  query: string;
  scope: MemoryScope;
  limit?: number;
  includeGlobal?: boolean;
  recordUsage?: boolean;
  retrievalMode?: RetrievalMode;
  semanticFallback?: SemanticFallbackMode;
}

export type RetrievalMode = "fts" | "semantic" | "hybrid";

export type SemanticFallbackMode = "error" | "fts";

export interface ListMemoriesInput {
  scope?: MemoryScope;
  tags?: string[];
  includeArchived?: boolean;
  needsReview?: boolean;
  reviewDueAt?: Date;
  limit?: number;
  cursor?: string;
}

export interface MemoryHistoryInput {
  limit?: number;
  cursor?: string;
}

export interface ForgetMemoryInput {
  id: string;
  expectedRevision?: number;
  mode?: "archive" | "delete";
  confirm?: boolean;
  actor: string;
  reason?: string;
}

export interface ForgetMemoriesInput {
  scope?: MemoryScope;
  tags?: string[];
  all?: boolean;
  mode?: "archive" | "delete";
  confirm?: boolean;
  dryRun?: boolean;
  actor: string;
  reason?: string;
}

export interface ForgetMemoriesResult {
  matched: number;
  affected: number;
  mode: "archive" | "delete";
  dryRun: boolean;
  ids: string[];
}

export interface MemoryRelationRecord {
  id: string;
  sourceMemoryId: string;
  targetMemoryId: string;
  relation: MemoryRelationType;
  reason: string | null;
  createdAt: Date;
}

export interface RelateMemoriesInput {
  sourceMemoryId: string;
  targetMemoryId: string;
  relation: MemoryRelationType;
  reason?: string;
  actor: string;
}

export interface ListMemoryRelationsInput {
  memoryId: string;
  includeReverse?: boolean;
  limit?: number;
}

export interface ListMemoryRelationsBatchInput {
  memoryIds: readonly string[];
  includeReverse?: boolean;
  limitPerMemory?: number;
}

export type RelationGovernanceReasonCode =
  | "exact_normalized_content"
  | "possible_revision"
  | "shared_subject"
  | "shared_tags"
  | "shared_terms"
  | "classification_uncertain"
  | "candidate_scan_truncated";

export type RelationGovernanceLifecycleState =
  | "active"
  | "archived"
  | "expired"
  | "review_due";

export interface ReviewMemoryRelationsInput {
  scope: MemoryScope;
  includeArchived?: boolean;
  needsReview?: boolean;
  limit?: number;
}

export interface RelationGovernanceExistingRelation {
  id: string;
  relation: MemoryRelationType;
  direction: "outgoing" | "incoming";
}

export interface RelationGovernanceCandidate {
  primaryMemoryId: string;
  primaryRevision: number;
  primaryScope: MemoryScope;
  primaryLifecycle: RelationGovernanceLifecycleState;
  candidateMemoryId: string;
  candidateRevision: number;
  candidateScope: MemoryScope;
  candidateLifecycle: RelationGovernanceLifecycleState;
  relationship: Exclude<CaptureRelationship, "independent">;
  reasonCodes: RelationGovernanceReasonCode[];
  state: "unreviewed" | "already_related";
  existingRelations: RelationGovernanceExistingRelation[];
}

export interface RelationGovernanceReview {
  version: 1;
  mode: "read_only";
  memoryWrites: false;
  relationWrites: false;
  lifecycleWrites: false;
  auditWrites: false;
  scope: MemoryScope;
  includeArchived: boolean;
  needsReview: boolean;
  memoryScanLimit: 200;
  candidateLimit: number;
  scannedMemories: number;
  reviewedMemories: number;
  memoryScanTruncated: boolean;
  candidateResultsTruncated: boolean;
  candidates: RelationGovernanceCandidate[];
}

export interface ForgetMemoryRelationInput {
  id: string;
  actor: string;
  reason?: string;
}

export type MemoryChallengeOutcome =
  | "valid"
  | "needs_review"
  | "stale"
  | "incorrect"
  | "superseded";

export const memoryChallengeOutcomes = [
  "valid",
  "needs_review",
  "stale",
  "incorrect",
  "superseded",
] as const satisfies readonly MemoryChallengeOutcome[];

export interface InspectMemoryInput {
  id: string;
  historyLimit?: number;
}

export interface MemoryInspection {
  memory: MemoryRecord;
  relations: MemoryRelationRecord[];
  events: MemoryEvent[];
}

export interface ChallengeMemoryInput {
  id: string;
  outcome: MemoryChallengeOutcome;
  reason: string;
  actor: string;
  expectedRevision?: number;
  supersededByMemoryId?: string;
}

export interface ChallengeMemoryResult {
  memory: MemoryRecord;
  relation: MemoryRelationRecord | null;
  outcome: MemoryChallengeOutcome;
}

export interface UpdateMemoryInput {
  id: string;
  expectedRevision?: number;
  content?: string;
  kind?: MemoryKind;
  scope?: MemoryScope;
  tags?: string[];
  confidence?: number;
  confidenceState?: MemoryConfidenceState | null;
  provenance?: MemoryProvenance | null;
  reviewAfter?: Date | null;
  expiresAt?: Date | null;
  actor: string;
}

export interface ExportMemoriesInput extends ListMemoriesInput {
  actor: string;
}

export interface ImportMemoriesInput {
  document: MemoryExportDocument;
  actor: string;
  scope?: MemoryScope;
  dryRun?: boolean;
}

export interface ImportMemoriesResult {
  imported: number;
  skipped: number;
  dryRun: boolean;
}

export interface MemoryExportDocument {
  format: "nuzo-memory-export";
  version: 1;
  exported_at: string;
  memories: MemoryExportItem[];
  relations?: MemoryExportRelationItem[];
}

export interface MemoryExportItem {
  scope: MemoryScope;
  kind: MemoryKind;
  content: string;
  tags: string[];
  source: string;
  confidence: number;
  confidence_state?: MemoryConfidenceState | null;
  provenance?: MemoryProvenance | null;
  review_after?: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  archived_at: string | null;
}

export interface MemoryExportRelationItem {
  source_index: number;
  target_index: number;
  relation: MemoryRelationType;
  reason?: string | null;
  created_at: string;
}

export interface RecallMemoryResult {
  memory: MemoryRecord;
  score: number;
  reason: string;
  retrievalMode?: RetrievalMode;
  semanticFallbackCode?: string;
}

export interface RecallDiagnostics {
  requestedMode: RetrievalMode;
  effectiveMode: RetrievalMode;
  semanticFallbackCode: string | null;
}

export interface RecallMemoriesResponse {
  results: RecallMemoryResult[];
  diagnostics: RecallDiagnostics;
}
