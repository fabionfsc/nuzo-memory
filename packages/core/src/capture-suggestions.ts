import type {
  CaptureRelationship,
  CaptureRelationshipCandidate,
  CaptureRelationshipEvidence,
  CaptureSuggestionResult,
  MemoryRecord,
} from "./types.js";

function normalizeContent(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}

export function toCaptureDuplicateKey(content: string): string {
  return normalizeContent(content).toLowerCase();
}

const captureCandidateLimit = 20;
const captureReturnedLimit = 3;
const captureTermLimit = 8;
const captureReasonLimit = 1_000;

interface BoundedCaptureSuggestionInput {
  draft: CaptureSuggestionResult["draft"];
  duplicate: MemoryRecord | null;
  memories: MemoryRecord[];
}

interface CaptureCandidateScore {
  memory: MemoryRecord;
  matchedTerms: string[];
  matchedTags: string[];
  subjectOverlap: number;
  domainOverlap: number;
  contradictionScore: number;
  score: number;
}

export function buildBoundedCaptureSuggestion(input: BoundedCaptureSuggestionInput): CaptureSuggestionResult {
  const activeSameScope = input.memories
    .filter((memory) => memory.archivedAt === null && memory.scope === input.draft.scope)
    .sort((left, right) => left.id.localeCompare(right.id));

  if (input.duplicate !== null) {
    return boundedResult({
      status: "duplicate",
      draft: input.draft,
      duplicate: input.duplicate,
      relationship: "exact_duplicate",
      evidence: {
        version: 1,
        primaryMemoryId: input.duplicate.id,
        candidateLimit: captureCandidateLimit,
        returnedLimit: captureReturnedLimit,
        evaluatedCount: 1,
        searchExhaustive: true,
        evidenceTruncated: false,
        reason: "The draft matches an active same-scope memory after exact capture normalization.",
        candidates: [{
          memory: input.duplicate,
          matchedTerms: matchedTerms(input.draft.content, input.duplicate.content),
          matchedTags: matchedTags(input.draft.tags, input.duplicate.tags),
          reason: "Exact normalized content match in the same active scope.",
        }],
      },
    });
  }

  const scored = activeSameScope
    .map((memory) => scoreCaptureCandidate(input.draft, memory))
    .filter((candidate) => candidate.score >= 4)
    .sort(compareCaptureCandidateScores);
  const evaluated = scored.slice(0, captureCandidateLimit);
  const searchExhaustive = scored.length <= captureCandidateLimit;
  const vague = isAmbiguousDraft(input.draft.content);
  const evidenceCandidates = evaluated;
  const relationshipCandidates = evidenceCandidates.filter((candidate) => (
    isUpdateCandidate(candidate) || isRelatedCandidate(candidate)
  ));
  const returnedCandidates = relationshipCandidates.slice(0, captureReturnedLimit).map(toRelationshipCandidate);
  const evidenceTruncated = evidenceCandidates.length > captureReturnedLimit || scored.length > captureCandidateLimit;

  if (vague) {
    return boundedResult({
      status: "review",
      draft: input.draft,
      duplicate: null,
      relationship: "uncertain",
      evidence: relationshipEvidence(
        vague
          ? "The draft uses broad or underspecified wording, so the relationship cannot be classified safely."
          : "Candidate retrieval was not exhaustive enough to safely classify the draft.",
        null,
        evaluated.length,
        searchExhaustive,
        evidenceTruncated,
        returnedCandidates,
      ),
    });
  }

  const updateCandidate = evaluated.find(isUpdateCandidate);
  if (updateCandidate) {
    return boundedResult({
      status: "review",
      draft: input.draft,
      duplicate: null,
      relationship: "update_candidate",
      evidence: relationshipEvidence(
        "The draft appears to revise an active same-scope memory rather than add a separate memory.",
        updateCandidate.memory.id,
        evaluated.length,
        searchExhaustive,
        evidenceTruncated,
        [toRelationshipCandidate(updateCandidate)],
      ),
    });
  }

  const relatedCandidate = evaluated.find(isRelatedCandidate);
  if (relatedCandidate) {
    return boundedResult({
      status: "review",
      draft: input.draft,
      duplicate: null,
      relationship: "related",
      evidence: relationshipEvidence(
        "The draft shares durable subject matter with an active same-scope memory, but does not clearly replace it.",
        relatedCandidate.memory.id,
        evaluated.length,
        searchExhaustive,
        evidenceTruncated,
        [toRelationshipCandidate(relatedCandidate)],
      ),
    });
  }

  return boundedResult({
    status: "ready",
    draft: input.draft,
    duplicate: null,
    relationship: "independent",
    evidence: {
      version: 1,
      primaryMemoryId: null,
      candidateLimit: captureCandidateLimit,
      returnedLimit: captureReturnedLimit,
      evaluatedCount: evaluated.length,
      searchExhaustive: true,
      evidenceTruncated: false,
      reason: "No active same-scope candidate met the bounded evidence threshold.",
      candidates: [],
    },
  });
}

function boundedResult(input: {
  status: "ready" | "duplicate" | "review";
  draft: CaptureSuggestionResult["draft"];
  duplicate: MemoryRecord | null;
  relationship: CaptureRelationship;
  evidence: CaptureRelationshipEvidence;
}): CaptureSuggestionResult {
  return {
    status: input.status,
    memoryWrites: false,
    requiresConfirmation: true,
    draft: input.draft,
    duplicate: input.duplicate,
    relationshipMode: "bounded",
    relationship: input.relationship,
    relationshipEvidence: input.evidence,
  };
}

function relationshipEvidence(
  reason: string,
  primaryMemoryId: string | null,
  evaluatedCount: number,
  searchExhaustive: boolean,
  evidenceTruncated: boolean,
  candidates: CaptureRelationshipCandidate[],
): CaptureRelationshipEvidence {
  return {
    version: 1,
    primaryMemoryId,
    candidateLimit: captureCandidateLimit,
    returnedLimit: captureReturnedLimit,
    evaluatedCount,
    searchExhaustive,
    evidenceTruncated,
    reason: truncateReason(reason),
    candidates,
  };
}

function scoreCaptureCandidate(
  draft: CaptureSuggestionResult["draft"],
  memory: MemoryRecord,
): CaptureCandidateScore {
  const terms = matchedTerms(draft.content, memory.content);
  const tags = matchedTags(draft.tags, memory.tags);
  const draftDomains = domainTerms(draft.content, draft.tags);
  const memoryDomains = domainTerms(memory.content, memory.tags);
  const domainOverlap = intersection(draftDomains, memoryDomains).length;
  const subjectOverlap = subjectSimilarity(draft.content, memory.content);
  const contradictionScore = contradictionSignals(draft.content, memory.content);
  const score = (terms.length * 2) + tags.length + (domainOverlap * 2) + subjectOverlap + contradictionScore +
    focusedDomainBonus(draft.content, memory.content, memory.tags);
  return { memory, matchedTerms: terms, matchedTags: tags, subjectOverlap, domainOverlap, contradictionScore, score };
}

function compareCaptureCandidateScores(left: CaptureCandidateScore, right: CaptureCandidateScore): number {
  return right.score - left.score ||
    right.contradictionScore - left.contradictionScore ||
    right.domainOverlap - left.domainOverlap ||
    right.subjectOverlap - left.subjectOverlap ||
    left.memory.id.localeCompare(right.memory.id);
}

function toRelationshipCandidate(candidate: CaptureCandidateScore): CaptureRelationshipCandidate {
  const cues = [];
  if (candidate.contradictionScore > 0) {
    cues.push("revision cue");
  }
  if (candidate.domainOverlap > 0) {
    cues.push("shared durable subject");
  }
  if (candidate.matchedTags.length > 0) {
    cues.push("tag overlap");
  }
  if (candidate.matchedTerms.length > 0) {
    cues.push(`matched terms: ${candidate.matchedTerms.slice(0, captureTermLimit).join(", ")}`);
  }
  return {
    memory: candidate.memory,
    matchedTerms: candidate.matchedTerms.slice(0, captureTermLimit),
    matchedTags: candidate.matchedTags.slice(0, captureTermLimit),
    reason: truncateReason(cues.length > 0 ? cues.join("; ") : "Bounded same-scope candidate."),
  };
}

function isUpdateCandidate(candidate: CaptureCandidateScore): boolean {
  return candidate.contradictionScore >= 2 && (
    candidate.subjectOverlap >= 2 ||
    candidate.domainOverlap >= 1 ||
    candidate.matchedTerms.length >= 3
  );
}

function isRelatedCandidate(candidate: CaptureCandidateScore): boolean {
  return candidate.score >= 4 && (
    hasSignificantRelationshipOverlap(candidate) ||
    hasSpecificTermOverlap(candidate) ||
    candidate.matchedTags.length >= 1
  );
}

function hasSpecificTermOverlap(candidate: CaptureCandidateScore): boolean {
  const specificTerms = candidate.matchedTerms.filter((term) => !genericRelationTerms.has(term));
  return specificTerms.length >= 2;
}

function hasSignificantRelationshipOverlap(candidate: CaptureCandidateScore): boolean {
  const candidateDomains = domainTerms(candidate.memory.content, candidate.memory.tags);
  for (const domain of ["api", "accessibility", "dependency", "backup", "docs", "npm", "response", "logging", "security"]) {
    if (candidate.domainOverlap > 0 && candidateDomains.has(domain)) {
      return true;
    }
  }
  return candidateDomains.has("deploy") && candidate.matchedTerms.length >= 2;
}

function matchedTerms(left: string, right: string): string[] {
  return intersection(captureTerms(left), captureTerms(right)).slice(0, captureTermLimit);
}

function matchedTags(left: readonly string[], right: readonly string[]): string[] {
  return intersection(new Set(left), new Set(right)).slice(0, captureTermLimit);
}

function intersection(left: ReadonlySet<string>, right: ReadonlySet<string>): string[] {
  return [...left].filter((term) => right.has(term)).sort();
}

function captureTerms(content: string): Set<string> {
  const normalized = normalizeCaptureText(content)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (!normalized) {
    return new Set();
  }
  return new Set(normalized
    .split(/\s+/)
    .map(stemCaptureTerm)
    .filter((term) => term.length >= 2 && !captureStopWords.has(term)));
}

function normalizeCaptureText(content: string): string {
  return content
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function stemCaptureTerm(term: string): string {
  if (/^[a-z0-9]+$/u.test(term)) {
    return term.replace(/(?:ing|ed|es|s)$/u, "");
  }
  return term;
}

const captureStopWords = new Set([
  "a", "an", "and", "are", "as", "at", "before", "by", "com", "da", "de", "do",
  "does", "e", "em", "for", "from", "has", "have", "in", "is", "it", "la", "le",
  "na", "no", "o", "of", "on", "or", "os", "para", "por", "que", "should", "the",
  "to", "use", "uses", "user", "with", "workflow", "process", "review", "revisao", "revisão",
  "change", "changes", "important",
  "は", "の", "する",
]);

const genericRelationTerms = new Set(["release", "branch", "branches", "deployment", "deploy"]);

function domainTerms(content: string, tags: readonly string[]): Set<string> {
  const domains = new Set<string>();
  for (const term of captureTerms(content)) {
    domains.add(captureDomainMap.get(term) ?? term);
  }
  for (const tag of tags) {
    for (const term of captureTerms(tag)) {
      domains.add(captureDomainMap.get(term) ?? term);
    }
  }
  return domains;
}

const captureDomainMap = new Map([
  ["answer", "response"], ["answers", "response"], ["resposta", "response"], ["respostas", "response"],
  ["応答", "response"], ["final", "response"], ["concise", "brevity"], ["objetiva", "brevity"],
  ["objetivas", "brevity"], ["簡潔", "brevity"], ["detailed", "detail"], ["detalhada", "detail"],
  ["detalhadas", "detail"], ["詳細", "detail"], ["timezone", "schedule"], ["schedules", "schedule"],
  ["utc", "schedule"], ["sao", "schedule"], ["paulo", "schedule"], ["npm", "npm"],
  ["publishing", "npm"], ["publish", "npm"], ["provenance", "npm"], ["sqlite", "storage"],
  ["postgresql", "storage"], ["storage", "storage"], ["stores", "storage"], ["memory", "memory"],
  ["memories", "memory"], ["documentation", "docs"], ["docs", "docs"], ["mkdocs", "docs"],
  ["validation", "validation"], ["preview", "validation"], ["deploy", "deploy"], ["deployment", "deploy"],
  ["implantacao", "deploy"], ["producao", "deploy"], ["rollback", "deploy"], ["api", "api"],
  ["json", "api"], ["correlation", "api"], ["backup", "backup"], ["export", "backup"],
  ["exports", "backup"], ["recovery", "backup"], ["accessibility", "accessibility"],
  ["frontend", "accessibility"], ["screen", "accessibility"], ["reader", "accessibility"],
  ["keyboard", "accessibility"], ["controls", "accessibility"], ["forms", "accessibility"],
  ["wcag", "accessibility"], ["dependency", "dependency"], ["dependencies", "dependency"],
  ["versions", "dependency"], ["pin", "dependency"], ["critical", "dependency"], ["release", "release"], ["branch", "release"],
  ["branches", "release"], ["security", "security"], ["bezpieczenstwa", "security"],
  ["logi", "logging"], ["logs", "logging"], ["logging", "logging"], ["checklist", "deploy"],
  ["component", "deploy"], ["components", "deploy"], ["owner", "ownership"],
]);

function focusedDomainBonus(content: string, memoryContent: string, memoryTags: readonly string[]): number {
  const draftDomains = domainTerms(content, []);
  const memoryDomains = domainTerms(memoryContent, memoryTags);
  let bonus = 0;
  for (const domain of ["dependency", "accessibility", "backup", "api", "docs", "npm", "response"]) {
    if (draftDomains.has(domain) && memoryDomains.has(domain)) {
      bonus += 2;
    }
  }
  return bonus;
}

function subjectSimilarity(left: string, right: string): number {
  return matchedTerms(left, right).length +
    intersection(domainTerms(left, []), domainTerms(right, [])).length;
}

function contradictionSignals(left: string, right: string): number {
  const combined = `${normalizeCaptureText(left)} ${normalizeCaptureText(right)}`;
  let score = 0;
  if (/\b(instead|rather than|instead of|now|manual|only)\b/u.test(combined)) {
    score += 2;
  }
  if (/\b(agora|em vez)\b/u.test(combined)) {
    score += 2;
  }
  for (const pair of contradictionPairs) {
    if (pair.every((term) => combined.includes(term))) {
      score += 2;
    }
  }
  return score;
}

const contradictionPairs = [
  ["concise", "detailed"], ["objetiva", "detalhada"], ["sqlite", "postgresql"],
  ["trusted publishing", "manual token"], ["america sao paulo", "utc"],
  ["every finished", "weekly"], ["only mkdocs", "preview build"], ["簡潔", "詳細"],
];

function isAmbiguousDraft(content: string): boolean {
  const normalized = normalizeCaptureText(content);
  let score = 0;
  for (const term of ["preferred", "process", "workflow", "different", "padrao", "preferido"]) {
    if (normalized.includes(term)) {
      score += 1;
    }
  }
  return score >= 2 && captureTerms(content).size <= 8;
}

function truncateReason(reason: string): string {
  return reason.length <= captureReasonLimit ? reason : reason.slice(0, captureReasonLimit);
}

