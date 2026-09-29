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
      version: 1,
      visibleExtensions: [".stl", ".obj"],
      excludedFolders: ["Archive"]
    });

    expect(loadLibraryViewPreferences(storage, "library-a")).toEqual({
      version: 1,
      visibleExtensions: [".stl", ".obj"],
      excludedFolders: ["Archive"]
    });
    expect(loadLibraryViewPreferences(storage, "library-b")).toEqual({
      version: 1,
      visibleExtensions: [...SUPPORTED_FILE_EXTENSIONS],
      excludedFolders: []
    });
  });

  it("falls back safely for invalid JSON or an unsupported version", () => {
    const storage = createStorage({
      "model-library:view-preferences:broken": "{not-json",
      "model-library:view-preferences:future": JSON.stringify({
        version: 2,
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
        version: 1,
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
        ]
      })
    });

    expect(loadLibraryViewPreferences(storage, "library-a")).toEqual({
      version: 1,
      visibleExtensions: [".stl", ".png"],
      excludedFolders: ["Archive/Old", "..draft"]
    });
  });

  it("stores a normalized versioned value", () => {
    const storage = createStorage();

    saveLibraryViewPreferences(storage, "library/a", {
      version: 1,
      visibleExtensions: [".obj", ".obj", ".zip"],
      excludedFolders: ["Parts\\Old", "../Outside"]
    });

    expect(storage.values.get("model-library:view-preferences:library%2Fa")).toBe(JSON.stringify({
      version: 1,
      visibleExtensions: [".obj", ".zip"],
      excludedFolders: ["Parts/Old"]
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
