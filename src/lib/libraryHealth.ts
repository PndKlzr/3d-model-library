import type {
  LibraryHealthIssue,
  LibraryHealthSnapshot,
  LibraryMetadata,
  LibraryMetadataStatus,
  LibraryScanResult,
  LibrarySessionIssueFact
} from "../shared/types";

export type LibraryHealthInput = {
  rootPath: string;
  checkedAt: string | null;
  scanResult: LibraryScanResult | null;
  metadata: LibraryMetadata;
  metadataStatus: LibraryMetadataStatus;
  sessionIssues: LibrarySessionIssueFact[];
  monitoringError: string | null;
  unavailableSlicerIds: string[];
};

export function buildLibraryHealthSnapshot(input: LibraryHealthInput): LibraryHealthSnapshot {
  const issues: LibraryHealthIssue[] = [];
  const add = (issue: LibraryHealthIssue) => {
    if (issues.length >= 250) return;
    issues.push({ ...issue, detail: issue.detail?.slice(0, 500) });
  };

  if (input.metadataStatus.source === "backup") {
    add(issue("metadata-recovered-backup", "warning", "metadata-backup", input.metadataStatus.message));
  }
  if (input.metadataStatus.availability === "read-only") {
    add(issue("metadata-read-only", "warning", "metadata-read-only", input.metadataStatus.message));
  } else if (input.metadataStatus.availability === "unavailable") {
    add(issue("metadata-unavailable", "error", "metadata-unavailable", input.metadataStatus.message));
  }

  const currentPaths = new Set((input.scanResult?.models ?? []).map((model) => normalize(model.absolutePath)));
  for (const [modelPath, metadata] of Object.entries(input.metadata.models)) {
    if (!metadata.favorite && metadata.tags.length === 0 && !metadata.notes.trim()) continue;
    if (!currentPaths.has(normalize(modelPath))) {
      add({
        ...issue("metadata-file-missing", "warning", `missing:${normalize(modelPath)}`),
        relativePath: toRelativePath(input.rootPath, modelPath)
      });
    }
  }

  for (const scanError of input.scanResult?.errors ?? []) {
    add({
      ...issue("scan-error", "error", `scan:${normalize(scanError.path)}`, scanError.message),
      relativePath: toRelativePath(input.rootPath, scanError.path)
    });
  }

  for (const sessionIssue of input.sessionIssues) {
    const code = sessionIssue.kind === "thumbnail" ? "thumbnail-failed" : "archive-read-failed";
    add({
      ...issue(code, "error", `${sessionIssue.kind}:${normalize(sessionIssue.modelPath)}`, sessionIssue.detail),
      relativePath: toRelativePath(input.rootPath, sessionIssue.modelPath)
    });
  }

  for (const slicerId of [...new Set(input.unavailableSlicerIds)]) {
    add(issue("slicer-unavailable", "warning", `slicer:${slicerId}`, slicerId));
  }
  if (input.monitoringError) {
    add(issue("monitoring-failed", "warning", "monitoring", input.monitoringError));
  }

  return {
    checkedAt: input.checkedAt,
    counts: {
      warning: issues.filter((item) => item.severity === "warning").length,
      error: issues.filter((item) => item.severity === "error").length
    },
    issues
  };
}

function issue(
  code: LibraryHealthIssue["code"],
  severity: LibraryHealthIssue["severity"],
  id: string,
  detail?: string | null
): LibraryHealthIssue {
  return { id, code, severity, ...(detail ? { detail } : {}) };
}

function normalize(value: string) {
  return value.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
}

function toRelativePath(rootPath: string, absolutePath: string): string | undefined {
  const root = normalize(rootPath);
  const candidate = normalize(absolutePath);
  if (!candidate.startsWith(`${root}/`)) return undefined;
  return absolutePath.replaceAll("\\", "/").slice(rootPath.replaceAll("\\", "/").replace(/\/+$/, "").length + 1);
}
