import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeLibraryIndex, encodeLibraryIndex } from "../../electron/services/libraryIndexCodec";
import { SUPPORTED_FILE_EXTENSIONS } from "../../src/shared/fileCapabilities";
import type { LibraryScanResult } from "../../src/shared/types";

describe("libraryIndexCodec", () => {
  it("encodes only normalized paths relative to the library", () => {
    const rootPath = path.resolve("C:/Models");
    const manifest = encodeLibraryIndex(rootPath, scanResult(rootPath), "library-1");

    expect(manifest.files[0].relativePath).toBe("part.stl");
    expect(manifest.folders).toEqual(["Props"]);
    expect(JSON.stringify(manifest)).not.toContain(rootPath.replaceAll("\\", "\\\\"));
    expect(manifest.files[0]).not.toHaveProperty("category");
  });

  it("round-trips every supported extension and reconstructs transient fields", () => {
    const rootPath = path.resolve("C:/Models");
    const models = SUPPORTED_FILE_EXTENSIONS.map((extension, index) => {
      const absolutePath = path.join(rootPath, "Parts", `part-${index}${extension}`);
      return {
        id: `stale-${index}`,
        name: `stale-${index}`,
        extension,
        absolutePath,
        relativeFolder: "stale",
        sizeBytes: index + 1,
        modifiedAt: "2026-09-09T00:00:00.000Z",
        dimensionsMm: { x: 1, y: 2, z: 3 },
        objectCount: 4,
        previewError: "stale"
      };
    });
    const result: LibraryScanResult = {
      rootPath,
      folders: ["Parts"],
      errors: [{ path: "ignored", message: "ignored" }],
      models
    };

    const decoded = decodeLibraryIndex(rootPath, encodeLibraryIndex(rootPath, result, "library-1"));

    expect(decoded.libraryId).toBe("library-1");
    expect(decoded.result.errors).toEqual([]);
    expect(decoded.result.models.map((model) => model.extension)).toEqual(SUPPORTED_FILE_EXTENSIONS);
    expect(decoded.result.models[0]).toEqual({
      id: path.join(rootPath, "Parts", "part-0.stl"),
      name: "part-0.stl",
      extension: ".stl",
      absolutePath: path.join(rootPath, "Parts", "part-0.stl"),
      relativeFolder: "Parts",
      sizeBytes: 1,
      modifiedAt: "2026-09-09T00:00:00.000Z",
      dimensionsMm: null,
      objectCount: null,
      previewError: null
    });
  });

  it.each(["../outside.stl", "C:/outside.stl", "/outside.stl", "\\\\server\\outside.stl"])(
    "rejects unsafe file path %s",
    (relativePath) => {
      const rootPath = path.resolve("C:/Models");
      const manifest = encodeLibraryIndex(rootPath, scanResult(rootPath), "library-1");
      expect(() => decodeLibraryIndex(rootPath, {
        ...manifest,
        files: [{ ...manifest.files[0], relativePath }]
      })).toThrow(/escape|relative/i);
    }
  );

  it.each(["../Outside", "C:/Outside", "/Outside"])("rejects unsafe folder path %s", (folder) => {
    const rootPath = path.resolve("C:/Models");
    const manifest = encodeLibraryIndex(rootPath, scanResult(rootPath), "library-1");
    expect(() => decodeLibraryIndex(rootPath, { ...manifest, folders: [folder] }))
      .toThrow(/escape|relative/i);
  });

  it("rejects malformed and unsupported manifests", () => {
    const rootPath = path.resolve("C:/Models");
    expect(() => decodeLibraryIndex(rootPath, null)).toThrow(/manifest|object/i);
    expect(() => decodeLibraryIndex(rootPath, { schemaVersion: 2 })).toThrow(/unsupported/i);
    expect(() => decodeLibraryIndex(rootPath, {
      schemaVersion: 1,
      libraryId: "id",
      savedAt: "not-a-date",
      folders: [],
      files: []
    })).toThrow(/timestamp|date/i);
  });

  it("rejects indexes above the 250,000-file limit", () => {
    const rootPath = path.resolve("C:/Models");
    const entry = encodeLibraryIndex(rootPath, scanResult(rootPath), "library-1").files[0];
    expect(() => decodeLibraryIndex(rootPath, {
      schemaVersion: 1,
      libraryId: "library-1",
      savedAt: "2026-09-09T00:00:00.000Z",
      folders: [],
      files: Array.from({ length: 250_001 }, () => entry)
    })).toThrow(/250,000|file limit/i);
  });
});

function scanResult(rootPath: string): LibraryScanResult {
  const absolutePath = path.join(rootPath, "part.stl");
  return {
    rootPath,
    folders: ["Props\\", "Props", "./Props"],
    errors: [],
    models: [{
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
    }]
  };
}
