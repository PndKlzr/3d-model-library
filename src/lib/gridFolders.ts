import type { ModelFile } from "../shared/types";
import { ALL_FOLDERS_ID } from "./folderFilters";
import type { FolderNode } from "./folderTree";

export type GridFolderCard = {
  id: string;
  name: string;
  modelCount: number;
  childCount: number;
};

export function getGridFolderCards(
  folders: FolderNode[],
  models: ModelFile[],
  selectedFolder: string
): GridFolderCard[] {
  const children =
    selectedFolder === ALL_FOLDERS_ID ? folders : findFolderNode(folders, selectedFolder)?.children ?? [];

  return children.map((folder) => ({
    id: folder.id,
    name: folder.name,
    childCount: folder.children.length,
    modelCount: countModelsInsideFolder(models, folder.id)
  }));
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
