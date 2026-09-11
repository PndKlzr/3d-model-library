import type { ModelFile } from "../shared/types";
import type { SupportedFileExtension } from "../shared/fileCapabilities";
import { ALL_FOLDERS_ID, isFolderExcluded } from "./folderFilters";
import type { FolderNode } from "./folderTree";

export type GridFolderCard = {
  id: string;
  name: string;
  modelCount: number;
  childCount: number;
  previewModels: ModelFile[];
};

export function getGridFolderCards(
  folders: FolderNode[],
  models: ModelFile[],
  selectedFolder: string,
  includeSubfolders: boolean,
  options: {
    visibleExtensions?: ReadonlySet<SupportedFileExtension>;
    excludedFolders?: readonly string[];
  } = {}
): GridFolderCard[] {
  if (includeSubfolders) {
    return [];
  }

  const children =
    selectedFolder === ALL_FOLDERS_ID ? folders : findFolderNode(folders, selectedFolder)?.children ?? [];
  const excludedFolders = options.excludedFolders ?? [];
  const filteredModels = models.filter((model) =>
    (!options.visibleExtensions || options.visibleExtensions.has(model.extension)) &&
    !isFolderExcluded(model.relativeFolder, excludedFolders)
  );

  return children.flatMap((folder) => {
    if (!shouldShowFolder(folder.id, models, filteredModels, options)) {
      return [];
    }

    return [{
      id: folder.id,
      name: folder.name,
      childCount: folder.children.filter((child) =>
        shouldShowFolder(child.id, models, filteredModels, options)
      ).length,
      modelCount: countModelsInsideFolder(filteredModels, folder.id),
      previewModels: getFolderPreviewModels(filteredModels, folder.id)
    }];
  });
}

function shouldShowFolder(
  folderId: string,
  models: ModelFile[],
  filteredModels: ModelFile[],
  options: {
    visibleExtensions?: ReadonlySet<SupportedFileExtension>;
    excludedFolders?: readonly string[];
  }
): boolean {
  if (
    options.visibleExtensions?.size === 0 ||
    isFolderExcluded(folderId, options.excludedFolders ?? [])
  ) {
    return false;
  }

  const totalModelCount = countModelsInsideFolder(models, folderId);
  return totalModelCount === 0 || countModelsInsideFolder(filteredModels, folderId) > 0;
}

function findFolderNode(folders: FolderNode[], folderId: string): FolderNode | null {
  for (const folder of folders) {
    if (folder.id === folderId) {
      return folder;
    }

    const child = findFolderNode(folder.children, folderId);

    if (child) {
      return child;
    }
  }

  return null;
}

function countModelsInsideFolder(models: ModelFile[], folderId: string): number {
  return models.filter(
    (model) => model.relativeFolder === folderId || model.relativeFolder.startsWith(`${folderId}/`)
  ).length;
}

function getFolderPreviewModels(models: ModelFile[], folderId: string): ModelFile[] {
  const printableModels = models.filter(
    (model) =>
      (model.extension === ".stl" || model.extension === ".3mf") &&
      (model.relativeFolder === folderId || model.relativeFolder.startsWith(`${folderId}/`))
  );
  const directModels = printableModels.filter((model) => model.relativeFolder === folderId);
  const descendantModels = printableModels.filter((model) => model.relativeFolder !== folderId);

  return [...directModels, ...descendantModels].slice(0, 4);
}
