import type { ModelFile } from "../shared/types";

export const ALL_FOLDERS_ID = "__all__";

export type ModelTypeFilter = "all" | ".stl" | ".3mf";
export type ModelSortMode = "name" | "modified" | "size";

export type ModelFilterOptions = {
  type?: ModelTypeFilter;
  sort?: ModelSortMode;
  onlySelected?: boolean;
  selectedIds?: Set<string>;
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

  const filteredModels = models.filter((model) => {
    const normalizedModelFolder = normalizeFolder(model.relativeFolder);
    const folderMatches =
      normalizedSelectedFolder === ALL_FOLDERS_ID ||
      (includeSubfolders
        ? isFolderOrDescendant(normalizedModelFolder, normalizedSelectedFolder)
        : normalizedModelFolder === normalizedSelectedFolder);

    if (!folderMatches) {
      return false;
    }

    if (typeFilter !== "all" && model.extension !== typeFilter) {
      return false;
    }

    if (options.onlySelected && !options.selectedIds?.has(model.id)) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return `${model.name} ${normalizedModelFolder}`.toLowerCase().includes(normalizedSearch);
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
