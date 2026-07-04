import { describe, expect, it } from "vitest";
import { ALL_FOLDERS_ID } from "../../src/lib/folderFilters";
import { getRenameTarget } from "../../src/lib/renameTarget";

describe("getRenameTarget", () => {
  it("prefers the focused model when a model was focused last", () => {
    expect(
      getRenameTarget({
        lastFocusedItem: "model",
        selectedFolder: "props",
        selectedModelId: "model-a"
      })
    ).toEqual({ type: "model" });
  });

  it("prefers the focused folder when a folder was focused last", () => {
    expect(
      getRenameTarget({
        lastFocusedItem: "folder",
        selectedFolder: "props",
        selectedModelId: "model-a"
      })
    ).toEqual({ type: "folder", folderId: "props" });
  });

  it("does not rename the All models pseudo-folder", () => {
    expect(
      getRenameTarget({
        lastFocusedItem: "folder",
        selectedFolder: ALL_FOLDERS_ID,
        selectedModelId: "model-a"
      })
    ).toEqual({ type: "model" });
  });
});
