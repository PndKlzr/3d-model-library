import type { ModelFile, ModelUserMetadata } from "../shared/types";

export const ALL_FOLDERS_ID = "__all__";

export type ModelTypeFilter = "all" | ".stl" | ".3mf";
export type ModelSortMode = "name" | "modified" | "size";

export type ModelFilterOptions = {
  type?: ModelTypeFilter;
  sort?: ModelSortMode;
  onlySelected?: boolean;
  selectedIds?: Set<string>;
  onlyDuplicates?: boolean;
  duplicateIds?: Set<string>;
  onlyFavorites?: boolean;
  selectedTags?: string[];
  metadataByPath?: Record<string, ModelUserMetadata>;
};

export function filterModels(
  models: ModelFile[],
  selectedFolder: string,
  includeSubfolders: boolean,
  searchQuery: string,
  options: ModelFilterOptions = {}
): ModelFile[] {
  const normalizedSelectedFolder = normalizeFolder(selectedFolder);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const typeFilter = options.type ?? "all";
  const sortMode = options.sort ?? "name";
  const selectedTags = normalizeTags(options.selectedTags ?? []);
  const metadataByPath = normalizeMetadataPathMap(options.metadataByPath ?? {});

  const filteredModels = models.filter((model) => {
    const normalizedModelFolder = normalizeFolder(model.relativeFolder);
    const modelMetadata = metadataByPath.get(normalizeModelPath(model.absolutePath));
    const folderMatches =
      normalizedSelectedFolder === ALL_FOLDERS_ID
        ? includeSubfolders || normalizedModelFolder === ""
        : includeSubfolders
          ? isFolderOrDescendant(normalizedModelFolder, normalizedSelectedFolder)
          : normalizedModelFolder === normalizedSelectedFolder;

    if (!folderMatches) {
      return false;
    }

    if (typeFilter !== "all" && model.extension !== typeFilter) {
      return false;
    }

    if (options.onlySelected && !options.selectedIds?.has(model.id)) {
      return false;
    }

    if (options.onlyDuplicates && !options.duplicateIds?.has(model.id)) {
      return false;
    }

    if (options.onlyFavorites && !modelMetadata?.favorite) {
      return false;
    }

    if (
      selectedTags.length > 0 &&
      !selectedTags.every((tag) => modelMetadata?.tags.includes(tag))
    ) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return `${model.name} ${normalizedModelFolder} ${modelMetadata?.tags.join(" ") ?? ""}`
      .toLowerCase()
      .includes(normalizedSearch);
  });

  return filteredModels.sort((left, right) => sortModels(left, right, sortMode));
}

function isFolderOrDescendant(modelFolder: string, selectedFolder: string): boolean {
  return modelFolder === selectedFolder || modelFolder.startsWith(`${selectedFolder}/`);
}

function sortModels(left: ModelFile, right: ModelFile, sortMode: ModelSortMode): number {
  if (sortMode === "modified") {
    return Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt) || left.name.localeCompare(right.name);
  }

  if (sortMode === "size") {
    return right.sizeBytes - left.sizeBytes || left.name.localeCompare(right.name);
  }

  return left.name.localeCompare(right.name);
}

function normalizeFolder(folder: string): string {
  return folder.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

function normalizeMetadataPathMap(
  metadataByPath: Record<string, ModelUserMetadata>
): Map<string, ModelUserMetadata> {
  return new Map(
    Object.entries(metadataByPath).map(([modelPath, metadata]) => [
      normalizeModelPath(modelPath),
      {
        ...metadata,
        tags: normalizeTags(metadata.tags ?? [])
      }
    ])
  );
}

function normalizeModelPath(modelPath: string): string {
  return modelPath.replaceAll("\\", "/").toLowerCase();
}
