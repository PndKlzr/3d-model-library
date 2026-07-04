import type { ModelFile } from "../shared/types";

export type FolderNode = {
  id: string;
  name: string;
  children: FolderNode[];
};

type MutableFolderNode = FolderNode & {
  childMap: Map<string, MutableFolderNode>;
};

export function buildFolderTree(models: ModelFile[], folderPaths: string[] = []): FolderNode[] {
  const rootMap = new Map<string, MutableFolderNode>();

  for (const folderPath of folderPaths) {
    addFolderPath(rootMap, folderPath);
  }

  for (const model of models) {
    addFolderPath(rootMap, model.relativeFolder);
  }

  return [...rootMap.values()]
    .sort(sortByName)
    .map((node) => stripMutableFields(node));
}

function stripMutableFields(node: MutableFolderNode): FolderNode {
  return {
    id: node.id,
    name: node.name,
    children: [...node.childMap.values()].sort(sortByName).map(stripMutableFields)
  };
}

function addFolderPath(rootMap: Map<string, MutableFolderNode>, folderPath: string) {
  const parts = folderPath.split("/").filter(Boolean);
  let currentMap = rootMap;
  let currentPath = "";

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    let node = currentMap.get(part);

    if (!node) {
      node = { id: currentPath, name: part, children: [], childMap: new Map() };
      currentMap.set(part, node);
    }

    currentMap = node.childMap;
  }
}

function sortByName(left: FolderNode, right: FolderNode): number {
  return left.name.localeCompare(right.name);
}
