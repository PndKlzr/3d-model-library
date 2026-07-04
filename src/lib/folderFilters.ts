import type { ModelFile } from "../shared/types";

export const ALL_FOLDERS_ID = "__all__";

export function filterModels(
  models: ModelFile[],
  selectedFolder: string,
  includeSubfolders: boolean,
  searchQuery: string
): ModelFile[] {
  const normalizedSelectedFolder = normalizeFolder(selectedFolder);
  const normalizedSearch = searchQuery.trim().toLowerCase();

  return models.filter((model) => {
    const normalizedModelFolder = normalizeFolder(model.relativeFolder);
    const folderMatches =
      normalizedSelectedFolder === ALL_FOLDERS_ID ||
      (includeSubfolders
        ? isFolderOrDescendant(normalizedModelFolder, normalizedSelectedFolder)
        : normalizedModelFolder === normalizedSelectedFolder);

    if (!folderMatches) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return `${model.name} ${normalizedModelFolder}`.toLowerCase().includes(normalizedSearch);
  });
}

function isFolderOrDescendant(modelFolder: string, selectedFolder: string): boolean {
  return modelFolder === selectedFolder || modelFolder.startsWith(`${selectedFolder}/`);
}

function normalizeFolder(folder: string): string {
  return folder.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
}
