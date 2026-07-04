import { describe, expect, it } from "vitest";
import type { ModelFile } from "../../src/shared/types";
import { buildFolderTree } from "../../src/lib/folderTree";

describe("buildFolderTree", () => {
  it("builds nested folders from model relative paths", () => {
    const tree = buildFolderTree([
      model("bench.stl", ""),
      model("helmet.stl", "cosplay"),
      model("visor.stl", "cosplay/helmet"),
      model("rock.stl", "terrain/forest")
    ]);

    expect(tree).toEqual([
      {
        id: "cosplay",
        name: "cosplay",
        children: [
          {
            id: "cosplay/helmet",
            name: "helmet",
            children: []
          }
        ]
      },
      {
        id: "terrain",
        name: "terrain",
        children: [
          {
            id: "terrain/forest",
            name: "forest",
            children: []
          }
        ]
      }
    ]);
  });

  it("returns no folders when all models are in the root", () => {
    expect(buildFolderTree([model("bench.stl", ""), model("clip.3mf", "")])).toEqual([]);
  });

  it("includes explicit folders even when they do not contain models", () => {
    expect(buildFolderTree([], ["empty", "empty/nested"])).toEqual([
      {
        id: "empty",
        name: "empty",
        children: [
          {
            id: "empty/nested",
            name: "nested",
            children: []
          }
        ]
      }
    ]);
  });
});

function model(name: string, relativeFolder: string): ModelFile {
  return {
    id: `${relativeFolder}/${name}`,
    name,
    extension: name.endsWith(".3mf") ? ".3mf" : ".stl",
    absolutePath: `C:/library/${relativeFolder}/${name}`,
    relativeFolder,
    sizeBytes: 100,
    modifiedAt: "2026-07-04T00:00:00.000Z",
    dimensionsMm: null,
    objectCount: null,
    previewError: null
  };
}
