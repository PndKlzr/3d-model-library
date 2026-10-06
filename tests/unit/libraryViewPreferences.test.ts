import { describe, expect, it } from "vitest";
import {
  loadLibraryViewPreferences,
  saveLibraryViewPreferences
} from "../../src/lib/libraryViewPreferences";
import { SUPPORTED_FILE_EXTENSIONS } from "../../src/shared/fileCapabilities";

describe("libraryViewPreferences", () => {
  it("isolates preferences by library id", () => {
    const storage = createStorage();

    saveLibraryViewPreferences(storage, "library-a", {
      version: 2,
      visibleExtensions: [".stl", ".obj"],
      excludedFolders: ["Archive"],
      sortMode: "modified",
      onlyFavorites: true,
      notesFilter: "with-notes",
      tagMatchMode: "any",
      selectedTags: ["functional", "tested"]
    });

    expect(loadLibraryViewPreferences(storage, "library-a")).toEqual({
      version: 2,
      visibleExtensions: [".stl", ".obj"],
      excludedFolders: ["Archive"],
      sortMode: "modified",
      onlyFavorites: true,
      notesFilter: "with-notes",
      tagMatchMode: "any",
      selectedTags: ["functional", "tested"]
    });
    expect(loadLibraryViewPreferences(storage, "library-b")).toEqual({
      version: 2,
      visibleExtensions: [...SUPPORTED_FILE_EXTENSIONS],
      excludedFolders: [],
      sortMode: "name",
      onlyFavorites: false,
      notesFilter: "all",
      tagMatchMode: "all",
      selectedTags: []
    });
  });

  it("migrates version 1 preferences with safe filter defaults", () => {
    const storage = createStorage({
      "model-library:view-preferences:library-a": JSON.stringify({
        version: 1,
        visibleExtensions: [".stl", ".3mf"],
        excludedFolders: ["Archive"]
      })
    });

    expect(loadLibraryViewPreferences(storage, "library-a")).toEqual({
      version: 2,
      visibleExtensions: [".stl", ".3mf"],
      excludedFolders: ["Archive"],
      sortMode: "name",
      onlyFavorites: false,
      notesFilter: "all",
      tagMatchMode: "all",
      selectedTags: []
    });
  });

  it("falls back safely for invalid JSON or an unsupported version", () => {
    const storage = createStorage({
      "model-library:view-preferences:broken": "{not-json",
      "model-library:view-preferences:future": JSON.stringify({
        version: 3,
        visibleExtensions: [".stl"],
        excludedFolders: ["Archive"]
      })
    });

    expect(loadLibraryViewPreferences(storage, "broken").visibleExtensions)
      .toEqual([...SUPPORTED_FILE_EXTENSIONS]);
    expect(loadLibraryViewPreferences(storage, "future").excludedFolders).toEqual([]);
  });

  it("normalizes unsupported extensions and unsafe folder exclusions", () => {
    const storage = createStorage({
      "model-library:view-preferences:library-a": JSON.stringify({
        version: 2,
        visibleExtensions: [".stl", ".exe", ".stl", ".png"],
        excludedFolders: [
          "Archive\\Old",
          "Archive/Old",
          "..\\Outside",
          "C:\\Models\\Absolute",
          "/absolute",
          "",
          "Safe/../Outside",
          "..draft"
        ],
        sortMode: "oldest",
        onlyFavorites: "yes",
        notesFilter: "invalid",
        tagMatchMode: "some",
        selectedTags: [" useful ", "useful", "", 42, "decorative"]
      })
    });

    expect(loadLibraryViewPreferences(storage, "library-a")).toEqual({
      version: 2,
      visibleExtensions: [".stl", ".png"],
      excludedFolders: ["Archive/Old", "..draft"],
      sortMode: "name",
      onlyFavorites: false,
      notesFilter: "all",
      tagMatchMode: "all",
      selectedTags: ["useful", "decorative"]
    });
  });

  it("stores a normalized versioned value", () => {
    const storage = createStorage();

    saveLibraryViewPreferences(storage, "library/a", {
      version: 2,
      visibleExtensions: [".obj", ".obj", ".zip"],
      excludedFolders: ["Parts\\Old", "../Outside"],
      sortMode: "size",
      onlyFavorites: true,
      notesFilter: "without-notes",
      tagMatchMode: "exclude",
      selectedTags: [" draft ", "draft"]
    });

    expect(storage.values.get("model-library:view-preferences:library%2Fa")).toBe(JSON.stringify({
      version: 2,
      visibleExtensions: [".obj", ".zip"],
      excludedFolders: ["Parts/Old"],
      sortMode: "size",
      onlyFavorites: true,
      notesFilter: "without-notes",
      tagMatchMode: "exclude",
      selectedTags: ["draft"]
    }));
  });
});

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    }
  };
}
