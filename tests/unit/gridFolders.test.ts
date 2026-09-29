import { describe, expect, it } from "vitest";
import type { ModelFile } from "../../src/shared/types";
import { SUPPORTED_FILE_EXTENSIONS } from "../../src/shared/fileCapabilities";
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

  it("includes direct images in folder previews while skipping archives", () => {
    const files = [
      model("photo.jpg", "parts"),
      model("bundle.zip", "parts"),
      model("nested.webp", "parts/nested"),
      model("shape.stl", "parts")
    ];

    const [card] = getGridFolderCards(
      buildFolderTree(files),
      files,
      ALL_FOLDERS_ID,
      false
    );

    expect(card.previewModels.map((item) => item.name)).toEqual([
      "photo.jpg",
      "shape.stl",
      "nested.webp"
    ]);
  });

  it("hides folder cards when subfolders are included", () => {
    const cards = getGridFolderCards(buildFolderTree(models), models, ALL_FOLDERS_ID, true);

    expect(cards).toEqual([]);
  });

  it("filters folder counts and previews by visible extensions", () => {
    const files = [
      model("mask.stl", "cosplay"),
      model("visor.3mf", "cosplay/helmet"),
      model("reference.obj", "cosplay/helmet"),
      model("tree.stl", "terrain")
    ];

    const cards = getGridFolderCards(
      buildFolderTree(files),
      files,
      ALL_FOLDERS_ID,
      false,
      { visibleExtensions: new Set([".3mf"]) }
    );

    expect(cards).toEqual([{
      id: "cosplay",
      name: "cosplay",
      modelCount: 1,
      childCount: 1,
      previewModels: [files[1]]
    }]);
  });

  it("removes recursively excluded folder cards, counts, and previews", () => {
    const files = [
      model("mask.stl", "cosplay"),
      model("visor.3mf", "cosplay/helmet"),
      model("old.stl", "cosplay/archive"),
      model("tree.stl", "terrain/forest")
    ];

    const cards = getGridFolderCards(
      buildFolderTree(files),
      files,
      ALL_FOLDERS_ID,
      false,
      {
        visibleExtensions: new Set([".stl", ".3mf"]),
        excludedFolders: ["cosplay/helmet", "terrain"]
      }
    );

    expect(cards).toEqual([{
      id: "cosplay",
      name: "cosplay",
      modelCount: 2,
      childCount: 1,
      previewModels: [files[0], files[2]]
    }]);
  });

  it("returns no result cards when every extension is hidden", () => {
    expect(getGridFolderCards(
      buildFolderTree(models),
      models,
      ALL_FOLDERS_ID,
      false,
      { visibleExtensions: new Set() }
    )).toEqual([]);
  });

  it("keeps genuinely empty folders navigable when no type is hidden", () => {
    const folders = buildFolderTree(models, ["empty", "empty/nested"]);

    const cards = getGridFolderCards(
      folders,
      models,
      ALL_FOLDERS_ID,
      false,
      { visibleExtensions: new Set(SUPPORTED_FILE_EXTENSIONS) }
    );

    expect(cards).toContainEqual({
      id: "empty",
      name: "empty",
      modelCount: 0,
      childCount: 1,
      previewModels: []
    });
  });

  it("keeps a parent visible when only a genuinely empty descendant remains", () => {
    const files = [
      model("hidden.obj", "parts/type-hidden"),
      model("excluded.stl", "parts/excluded")
    ];
    const folders = buildFolderTree(files, ["parts/empty"]);
    const options = {
      visibleExtensions: new Set([".stl"] as const),
      excludedFolders: ["parts/excluded"]
    };

    expect(getGridFolderCards(
      folders,
      files,
      ALL_FOLDERS_ID,
      false,
      options
    )).toEqual([{
      id: "parts",
      name: "parts",
      modelCount: 0,
      childCount: 1,
      previewModels: []
    }]);

    expect(getGridFolderCards(
      folders,
      files,
      "parts",
      false,
      options
    )).toEqual([{
      id: "parts/empty",
      name: "empty",
      modelCount: 0,
      childCount: 0,
      previewModels: []
    }]);
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
