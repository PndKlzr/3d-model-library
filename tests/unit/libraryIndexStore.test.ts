import { describe, expect, it, vi } from "vitest";
import {
  createLibraryIndexStore,
  type LibraryIndexBackend
} from "../../electron/services/libraryIndexStore";
import type { LibraryScanResult } from "../../src/shared/types";

describe("libraryIndexStore", () => {
  it("returns a cloned versioned snapshot only for the requested library", () => {
    let stored: unknown;
    const backend: LibraryIndexBackend = {
      get: () => stored,
      set: (snapshot) => {
        stored = snapshot;
      }
    };
    const store = createLibraryIndexStore(backend);
    const result = scanResult("C:\\Models");

    store.set(result);

    expect(store.get("C:\\Models")).toEqual(result);
    expect(store.get("C:\\Other")).toBeNull();
    expect(store.get("C:\\Models")).not.toBe(result);
  });

  it("ignores corrupt and unsupported snapshots", () => {
    const set = vi.fn();

    expect(createLibraryIndexStore({ get: () => ({ version: 99 }), set }).get("C:\\Models"))
      .toBeNull();
    expect(createLibraryIndexStore({ get: () => "broken", set }).get("C:\\Models"))
      .toBeNull();
  });

  it("does not expose mutable backend data", () => {
    let stored: unknown;
    const store = createLibraryIndexStore({
      get: () => stored,
      set: (snapshot) => {
        stored = snapshot;
      }
    });
    const result = scanResult("C:\\Models");
    store.set(result);

    const firstRead = store.get("C:\\Models");
    firstRead?.models.splice(0);

    expect(store.get("C:\\Models")?.models).toHaveLength(1);
  });
});

function scanResult(rootPath: string): LibraryScanResult {
  const absolutePath = `${rootPath}\\part.stl`;
  return {
    rootPath,
    folders: [],
    errors: [],
    models: [
      {
        id: absolutePath,
        name: "part.stl",
        extension: ".stl",
        absolutePath,
        relativeFolder: "",
        sizeBytes: 10,
        modifiedAt: "2026-09-09T00:00:00.000Z",
        dimensionsMm: null,
        objectCount: null,
        previewError: null
      }
    ]
  };
}
