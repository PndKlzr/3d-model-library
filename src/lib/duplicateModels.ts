import type { ModelFile } from "../shared/types";

export function getDuplicateModelIds(models: ModelFile[]): Set<string> {
  const groups = new Map<string, ModelFile[]>();

  for (const model of models) {
    const key = `${normalizeModelBaseName(model.name)}:${model.sizeBytes}`;
    groups.set(key, [...(groups.get(key) ?? []), model]);
  }

  const duplicateIds = new Set<string>();

  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }

    for (const model of group) {
      duplicateIds.add(model.id);
    }
  }

  return duplicateIds;
}

function normalizeModelBaseName(name: string): string {
  return name.replace(/\.(stl|3mf)$/i, "").trim().toLowerCase();
}
