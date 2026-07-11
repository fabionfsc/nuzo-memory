import { formatSecretScan, type DoctorReport } from "./doctor.js";

interface PrivacyFinding {
  code:
    | "store_missing"
    | "git_check_unavailable"
    | "tracked_memory_files"
    | "unsafe_runtime_paths"
    | "stale_runtime_artifacts"
    | "unexpected_runtime_files"
    | "recall_audit_enabled"
    | "semantic_index_present"
    | "secret_patterns_detected";
  count: number;
  guidance: string;
}

export function toPrivacyDoctorOutput(report: DoctorReport) {
  const findings = createPrivacyFindings(report);
  return {
    profile: "privacy",
    read_only: true,
    storage: {
      initialized: report.storeExists,
      store_source: report.provenance.store,
      scope: report.scope,
      authorization_mode: report.authorizationMode,
    },
    network: { enabled: false },
    recall_audit: { enabled: report.recallEventRecording },
    filesystem: {
      permission_semantics: report.fileSafety.permissionSemantics,
      inspected_paths: report.fileSafety.inspectedPaths,
      unsafe_findings: report.fileSafety.unsafe.length,
      stale_artifacts: report.fileSafety.staleArtifacts.length,
      unexpected_files: report.fileSafety.unexpectedFiles.length,
    },
    git: {
      status: report.gitTracking.status,
      tracked_memory_files: report.gitTracking.trackedFiles.length,
    },
    semantics: {
      index_present: report.semantic.indexPresent,
      model_directory_present: report.semantic.modelDirectoryPresent,
    },
    secret_scan: {
      status: report.secretScan.status,
      scanned_records: report.secretScan.scannedRecords,
      flagged_records: report.secretScan.flaggedRecords,
      findings_by_kind: report.secretScan.findingsByKind,
    },
    findings,
    status: findings.length === 0 ? "ok" : "warning",
  };
}

export function formatPrivacyDoctorReport(report: DoctorReport): string {
  const output = toPrivacyDoctorOutput(report);
  const lines = [
    "Nuzo privacy report (read-only)",
    `Storage: ${output.storage.initialized ? "initialized" : "not initialized"}`,
    `Store source: ${output.storage.store_source}`,
    `Scope: ${output.storage.scope}`,
    `Authorization: ${output.storage.authorization_mode} (local CLI)`,
    `Network: ${output.network.enabled ? "enabled" : "disabled"}`,
    `Recall event recording: ${output.recall_audit.enabled ? "enabled" : "disabled"}`,
    `Filesystem permission semantics: ${output.filesystem.permission_semantics}`,
    `Unsafe runtime path findings: ${output.filesystem.unsafe_findings}`,
    `Stale runtime artifacts: ${output.filesystem.stale_artifacts}`,
    `Unexpected runtime files: ${output.filesystem.unexpected_files}`,
    `Git tracking: ${output.git.status} (${output.git.tracked_memory_files} tracked memory file(s))`,
    `Semantic index: ${output.semantics.index_present ? "present" : "not present"}`,
    `Local model directory: ${output.semantics.model_directory_present ? "present" : "not present"}`,
    formatSecretScan(report.secretScan),
  ];
  for (const finding of output.findings) {
    lines.push(`Finding: ${finding.code} (${finding.count}) - ${finding.guidance}`);
  }
  lines.push(`Status: ${output.status}`);
  return lines.join("\n");
}

function createPrivacyFindings(report: DoctorReport): PrivacyFinding[] {
  const findings: PrivacyFinding[] = [];
  if (!report.storeExists) {
    findings.push({
      code: "store_missing",
      count: 1,
      guidance: "Initialize the selected store before trusting it with memory.",
    });
  }
  if (report.gitTracking.status === "unavailable") {
    findings.push({
      code: "git_check_unavailable",
      count: 1,
      guidance: "Run doctor inside the intended Git worktree.",
    });
  }
  if (report.gitTracking.status === "tracked") {
    findings.push({
      code: "tracked_memory_files",
      count: report.gitTracking.trackedFiles.length,
      guidance: "Remove runtime memory artifacts from Git tracking and keep the ignore rules enabled.",
    });
  }
  if (report.fileSafety.unsafe.length > 0) {
    findings.push({
      code: "unsafe_runtime_paths",
      count: report.fileSafety.unsafe.length,
      guidance: "Review ownership, permissions, and symlinks with the standard doctor report.",
    });
  }
  if (report.fileSafety.staleArtifacts.length > 0) {
    findings.push({
      code: "stale_runtime_artifacts",
      count: report.fileSafety.staleArtifacts.length,
      guidance: "Review stale temporary or backup artifacts before removing them explicitly.",
    });
  }
  if (report.fileSafety.unexpectedFiles.length > 0) {
    findings.push({
      code: "unexpected_runtime_files",
      count: report.fileSafety.unexpectedFiles.length,
      guidance: "Inspect unexpected runtime entries with the standard doctor report.",
    });
  }
  if (report.recallEventRecording) {
    findings.push({
      code: "recall_audit_enabled",
      count: 1,
      guidance: "Treat recall audit metadata as sensitive and disable recording unless it is needed.",
    });
  }
  if (report.semantic.indexPresent) {
    findings.push({
      code: "semantic_index_present",
      count: 1,
      guidance: "Keep the derived semantic sidecar inside the same trust boundary as the memory store.",
    });
  }
  if (report.secretScan.status === "completed" && report.secretScan.flaggedRecords > 0) {
    findings.push({
      code: "secret_patterns_detected",
      count: report.secretScan.flaggedRecords,
      guidance: "Inspect and sanitize flagged records locally, then rotate real credentials outside Nuzo.",
    });
  }
  return findings;
}
