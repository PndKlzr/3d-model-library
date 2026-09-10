import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodePortableMetadata,
  encodePortableMetadata
} from "../../electron/services/portableMetadataCodec";

describe("portableMetadataCodec", () => {
  const rootPath = path.resolve("C:/library");
  const modelPath = path.join(rootPath, "Brinquedos", "acao + teste.3mf");

  it("stores model and history paths relative to the library", () => {
    const manifest = encodePortableMetadata(
      rootPath,
      "library-id",
      {
        models: {
          [modelPath]: { favorite: true, tags: ["Fidget"], notes: "PLA" }
        },
        tagCatalog: ["Fidget"],
        slicerHistory: [
          { modelPath, slicerId: "cura", openedAt: "2026-09-09T10:00:00.000Z" }
        ]
      },
      "2026-09-09T11:00:00.000Z"
    );

    expect(Object.keys(manifest.models)).toEqual(["Brinquedos/acao + teste.3mf"]);
    expect(manifest.slicerHistory[0].relativePath).toBe("Brinquedos/acao + teste.3mf");
    expect(JSON.stringify(manifest)).not.toContain(rootPath);

    const decoded = decodePortableMetadata(rootPath, manifest);
    expect(decoded.metadata.models[modelPath]).toEqual({
      favorite: true,
      tags: ["fidget"],
      notes: "PLA"
    });
    expect(decoded.metadata.slicerHistory[0].modelPath).toBe(modelPath);
  });

  it.each(["C:/outside/model.stl", "../outside.stl", "/absolute.stl"])(
    "rejects unsafe manifest path %s",
    (relativePath) => {
      expect(() =>
        decodePortableMetadata(rootPath, {
          schemaVersion: 1,
          libraryId: "library-id",
          updatedAt: "2026-09-09T11:00:00.000Z",
          tagCatalog: [],
          models: {
            [relativePath]: { favorite: true, tags: [], notes: "" }
          },
          slicerHistory: []
        })
      ).toThrow(/relative|library/i);
    }
  );

  it("rejects an incompatible schema version", () => {
    expect(() => decodePortableMetadata(rootPath, { schemaVersion: 2 })).toThrow(/version/i);
  });

  it("rejects known fields that exceed their safe limits", () => {
    expect(() =>
      decodePortableMetadata(rootPath, {
        schemaVersion: 1,
        libraryId: "library-id",
        updatedAt: "2026-09-09T11:00:00.000Z",
        tagCatalog: ["x".repeat(81)],
        models: {},
        slicerHistory: []
      })
    ).toThrow(/tag/i);
  });
});
