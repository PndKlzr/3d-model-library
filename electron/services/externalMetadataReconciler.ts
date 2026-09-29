import path from "node:path";
import type {
  FileContentIdentity,
  LibraryMetadata,
  LibraryScanResult,
  ModelFile
} from "../../src/shared/types.js";
import { isPathInside } from "./pathContainment.js";

export type MetadataPathMove = {
  sourcePath: string;
  destinationPath: string;
};

type ReconciliationInput = {
  rootPath: string;
  previousScan: LibraryScanResult | null;
  nextScan: LibraryScanResult;
  metadata: LibraryMetadata;
  identifyFile: (absolutePath: string) => Promise<FileContentIdentity | null>;
};

export async function reconcileExternalMetadataMoves({
  rootPath,
  previousScan,
  nextScan,
  metadata,
  identifyFile
}: ReconciliationInput): Promise<MetadataPathMove[]> {
  const nextPaths = new Set(nextScan.models.map((model) => normalizePath(model.absolutePath)));
  const previousPaths = new Set(
    (previousScan?.models ?? []).map((model) => normalizePath(model.absolutePath))
  );
  const missingSources = Object.entries(metadata.fileIdentities)
    .filter(([modelPath]) =>
      isPathInside(rootPath, modelPath) &&
      !nextPaths.has(normalizePath(modelPath)) &&
      hasDurableModelData(metadata, modelPath)
    )
    .map(([modelPath, identity]) => ({ modelPath, identity }));

  if (missingSources.length === 0) return [];

  const candidateSizes = new Set(missingSources.map(({ identity }) => identity.sizeBytes));
  const additions = nextScan.models.filter((model) =>
    isPathInside(rootPath, model.absolutePath) &&
    candidateSizes.has(model.sizeBytes) &&
    (!previousScan || !previousPaths.has(normalizePath(model.absolutePath)))
  );
  const identifiedAdditions: Array<{ model: ModelFile; identity: FileContentIdentity }> = [];

  for (const model of additions) {
    try {
      const identity = await identifyFile(model.absolutePath);
      if (
        identity &&
        identity.sizeBytes === model.sizeBytes &&
        identity.modifiedAt === model.modifiedAt
      ) {
        identifiedAdditions.push({ model, identity });
      }
    } catch {
      // A disappearing or unreadable candidate is not safe to reconcile.
    }
  }

  const sourcesByDigest = groupByDigest(missingSources.map(({ modelPath, identity }) => ({
    path: modelPath,
    identity
  })));
  const destinationsByDigest = groupByDigest(identifiedAdditions.map(({ model, identity }) => ({
    path: model.absolutePath,
    identity
  })));
  const moves: MetadataPathMove[] = [];

  for (const [digest, sources] of sourcesByDigest) {
    const destinations = destinationsByDigest.get(digest) ?? [];
    if (sources.length !== 1 || destinations.length !== 1) continue;
    moves.push({ sourcePath: sources[0], destinationPath: destinations[0] });
  }

  return moves.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
}

function groupByDigest(entries: Array<{ path: string; identity: FileContentIdentity }>) {
  const groups = new Map<string, string[]>();
  for (const entry of entries) {
    const key = `${entry.identity.sizeBytes}:${entry.identity.digest}`;
    groups.set(key, [...(groups.get(key) ?? []), entry.path]);
  }
  return groups;
}

function hasDurableModelData(metadata: LibraryMetadata, modelPath: string): boolean {
  const key = normalizePath(modelPath);
  const model = Object.entries(metadata.models).find(([candidate]) =>
    normalizePath(candidate) === key
  )?.[1];
  return Boolean(
    model?.favorite ||
    model?.tags.length ||
    model?.notes.trim() ||
    metadata.slicerHistory.some((entry) => normalizePath(entry.modelPath) === key)
  );
}

function normalizePath(filePath: string): string {
  return path.resolve(filePath).toLowerCase();
}
