import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createLibrarySessionResetState,
  isCurrentLibraryResult
} from "../../src/lib/librarySessionState";
import type { LibrarySessionRef } from "../../src/shared/types";

describe("librarySessionState", () => {
  it("accepts only the same generation and normalized root", () => {
    const active: LibrarySessionRef = {
      generation: 4,
      rootPath: path.join("C:", "Models"),
      libraryId: "active-id"
    };

    expect(isCurrentLibraryResult(active, {
      ...active,
      rootPath: path.join("c:", "models", ".")
    })).toBe(true);
    expect(isCurrentLibraryResult(active, { ...active, generation: 3 })).toBe(false);
    expect(isCurrentLibraryResult(active, { ...active, rootPath: path.join("C:", "Other") })).toBe(false);
    expect(isCurrentLibraryResult(null, active)).toBe(false);
  });

  it("resets every transient value owned by a library session", () => {
    const reset = createLibrarySessionResetState();

    expect(reset).toEqual({
      scanResult: null,
      selectedModel: null,
      selectedModelIds: new Set(),
      lastSelectedModelId: null,
      selectedFolder: "__all__",
      folderHistory: { back: [], forward: [] },
      draggedModelIds: [],
      activeFileDragSessionId: null,
      previewModel: null,
      searchQuery: "",
      folderContextMenu: null,
      modelContextMenu: null
    });
  });
});
