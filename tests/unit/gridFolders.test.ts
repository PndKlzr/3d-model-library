import { describe, expect, it } from "vitest";
import type { ModelFile } from "../../src/shared/types";
import { ALL_FOLDERS_ID } from "../../src/lib/folderFilters";
import { buildFolderTree } from "../../src/lib/folderTree";
import { getGridFolderCards } from "../../src/lib/gridFolders";

const models = [
  model("root.stl", ""),
  model("mask.stl", "cosplay"),
  model("visor.3mf", "cosplay/helmet"),
  model("tree.stl", "terrain/forest")
];

describe("getGridFolderCards", () => {
  it("returns top-level folders for the All view with descendant model counts", () => {
    const cards = getGridFolderCards(buildFolderTree(models), models, ALL_FOLDERS_ID);

    expect(cards).toEqual([
      { id: "cosplay", name: "cosplay", modelCount: 2, childCount: 1 },
      { id: "terrain", name: "terrain", modelCount: 1, childCount: 1 }
    ]);
  });

  it("returns direct child folders for the selected folder", () => {
    const cards = getGridFolderCards(buildFolderTree(models), models, "cosplay");

    expect(cards).toEqual([
      { id: "cosplay/helmet", name: "helmet", modelCount: 1, childCount: 0 }
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
