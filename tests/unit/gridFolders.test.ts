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
  it("returns top-level folder cards for the All view", () => {
    const cards = getGridFolderCards(buildFolderTree(models), models, ALL_FOLDERS_ID, false);

    expect(cards).toEqual([
      {
        id: "cosplay",
        name: "cosplay",
        modelCount: 2,
        childCount: 1,
        previewModels: [models[1], models[2]]
      },
      {
        id: "terrain",
        name: "terrain",
        modelCount: 1,
        childCount: 1,
        previewModels: [models[3]]
      }
    ]);
  });

  it("returns direct child folders for the selected folder", () => {
    const cards = getGridFolderCards(buildFolderTree(models), models, "cosplay", false);

    expect(cards).toEqual([
      {
        id: "cosplay/helmet",
        name: "helmet",
        modelCount: 1,
        childCount: 0,
        previewModels: [models[2]]
      }
    ]);
  });

  it("prioritizes direct printable models and caps folder previews at four", () => {
    const previewModels = [
      model("direct-a.stl", "parts"),
      model("bundle.zip", "parts"),
      model("direct-b.3mf", "parts"),
      model("nested-a.stl", "parts/nested"),
      model("nested-b.stl", "parts/nested"),
      model("nested-c.stl", "parts/nested")
    ];

    const [card] = getGridFolderCards(
      buildFolderTree(previewModels),
      previewModels,
      ALL_FOLDERS_ID,
      false
    );

    expect(card.previewModels.map((item) => item.name)).toEqual([
      "direct-a.stl",
      "direct-b.3mf",
      "nested-a.stl",
      "nested-b.stl"
    ]);
  });

  it("hides folder cards when subfolders are included", () => {
    const cards = getGridFolderCards(buildFolderTree(models), models, ALL_FOLDERS_ID, true);

    expect(cards).toEqual([]);
  });
});

function model(name: string, relativeFolder: string): ModelFile {
  const extension = name.slice(name.lastIndexOf(".")) as ModelFile["extension"];

  return {
    id: `${relativeFolder}/${name}`,
    name,
    extension,
    absolutePath: `C:/library/${relativeFolder}/${name}`,
    relativeFolder,
    sizeBytes: 100,
    modifiedAt: "2026-07-04T00:00:00.000Z",
    dimensionsMm: null,
    objectCount: null,
    previewError: null
  };
}
