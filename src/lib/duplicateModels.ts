import type { ModelFile } from "../shared/types";

export function getDuplicateModelIds(
  models: ModelFile[],
  modelHashes: Record<string, string> = {}
): Set<string> {
  const duplicateIds = new Set<string>();
  const hashedModels = new Set<string>();
  const hashGroups = new Map<string, ModelFile[]>();

  for (const model of models) {
    const hash = modelHashes[model.absolutePath];

    if (!hash) {
      continue;
    }

    hashedModels.add(model.id);
    hashGroups.set(hash, [...(hashGroups.get(hash) ?? []), model]);
  }

  addDuplicateGroups(duplicateIds, hashGroups);

  const modelsWithoutHash = models.filter((model) => !hashedModels.has(model.id));
  const groups = new Map<string, ModelFile[]>();

  for (const model of modelsWithoutHash) {
    const key = `${normalizeModelBaseName(model.name)}:${model.sizeBytes}`;
    groups.set(key, [...(groups.get(key) ?? []), model]);
  }

  addDuplicateGroups(duplicateIds, groups);

  return duplicateIds;
}

function addDuplicateGroups(duplicateIds: Set<string>, groups: Map<string, ModelFile[]>) {
  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }

    for (const model of group) {
      duplicateIds.add(model.id);
    }
  }
}

function normalizeModelBaseName(name: string): string {
  return name.replace(/\.(stl|3mf)$/i, "").trim().toLowerCase();
}
