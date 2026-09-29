import { ALL_FOLDERS_ID } from "./folderFilters";
import { createFolderNavigationHistory } from "./folderNavigationHistory";
import type { LibraryScanResult, LibrarySessionRef, ModelFile } from "../shared/types";

export type LibrarySessionResetState = {
  scanResult: LibraryScanResult | null;
  selectedModel: ModelFile | null;
  selectedModelIds: Set<string>;
  lastSelectedModelId: string | null;
  selectedFolder: string;
  folderHistory: ReturnType<typeof createFolderNavigationHistory>;
  draggedModelIds: string[];
  activeFileDragSessionId: string | null;
  previewModel: ModelFile | null;
  searchQuery: string;
  folderContextMenu: null;
  modelContextMenu: null;
};

export function isCurrentLibraryResult(
  active: LibrarySessionRef | null,
  incoming: LibrarySessionRef
): boolean {
  return Boolean(active) &&
    active!.generation === incoming.generation &&
    active!.libraryId === incoming.libraryId &&
    normalizeRoot(active!.rootPath) === normalizeRoot(incoming.rootPath);
}

export function createLibrarySessionResetState(): LibrarySessionResetState {
  return {
    scanResult: null,
    selectedModel: null,
    selectedModelIds: new Set(),
    lastSelectedModelId: null,
    selectedFolder: ALL_FOLDERS_ID,
    folderHistory: createFolderNavigationHistory(),
    draggedModelIds: [],
    activeFileDragSessionId: null,
    previewModel: null,
    searchQuery: "",
    folderContextMenu: null,
    modelContextMenu: null
  };
}

function normalizeRoot(rootPath: string): string {
  const normalized = rootPath.replaceAll("\\", "/");
  const prefix = normalized.startsWith("//") ? "//" : normalized.startsWith("/") ? "/" : "";
  const segments: string[] = [];

  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }

  return `${prefix}${segments.join("/")}`.toLowerCase();
}
