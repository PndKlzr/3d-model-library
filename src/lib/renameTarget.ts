import { ALL_FOLDERS_ID } from "./folderFilters";

export type FocusedLibraryItem = "folder" | "model";

export type RenameTarget =
  | { type: "folder"; folderId: string }
  | { type: "model" }
  | { type: "none" };

export function getRenameTarget({
  lastFocusedItem,
  selectedFolder,
  selectedModelId
}: {
  lastFocusedItem: FocusedLibraryItem;
  selectedFolder: string;
  selectedModelId: string | null;
}): RenameTarget {
  const canRenameFolder = selectedFolder !== ALL_FOLDERS_ID;

  if (lastFocusedItem === "model" && selectedModelId) {
    return { type: "model" };
  }

  if (lastFocusedItem === "folder" && canRenameFolder) {
    return { type: "folder", folderId: selectedFolder };
  }

  if (selectedModelId) {
    return { type: "model" };
  }

  if (canRenameFolder) {
    return { type: "folder", folderId: selectedFolder };
  }

  return { type: "none" };
}
