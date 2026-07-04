import { describe, expect, it } from "vitest";
import type { ModelFile } from "../../src/shared/types";
import { ALL_FOLDERS_ID, filterModels } from "../../src/lib/folderFilters";

const models: ModelFile[] = [
  model("root.stl", ""),
  model("helmet.stl", "cosplay"),
  model("visor.3mf", "cosplay/helmet"),
  model("tree.stl", "terrain/forest")
];

describe("filterModels", () => {
  it("returns every model in the All view", () => {
    expect(filterModels(models, ALL_FOLDERS_ID, false, "")).toHaveLength(4);
  });

  it("includes nested files when includeSubfolders is enabled", () => {
    const result = filterModels(models, "cosplay", true, "");

    expect(result.map((modelFile) => modelFile.name)).toEqual(["helmet.stl", "visor.3mf"]);
  });

  it("returns only direct children when includeSubfolders is disabled", () => {
    const result = filterModels(models, "cosplay", false, "");

    expect(result.map((modelFile) => modelFile.name)).toEqual(["helmet.stl"]);
  });

  it("matches search queries against file names", () => {
    const result = filterModels(models, ALL_FOLDERS_ID, true, "visor");

    expect(result.map((modelFile) => modelFile.name)).toEqual(["visor.3mf"]);
  });

  it("matches search queries against folder paths", () => {
    const result = filterModels(models, ALL_FOLDERS_ID, true, "forest");

    expect(result.map((modelFile) => modelFile.name)).toEqual(["tree.stl"]);
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
