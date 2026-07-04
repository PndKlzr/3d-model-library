import { describe, expect, it } from "vitest";
import type { ModelFile } from "../../src/shared/types";
import { ALL_FOLDERS_ID, filterModels } from "../../src/lib/folderFilters";

const models: ModelFile[] = [
  model("root.stl", "", 100, "2026-07-01T00:00:00.000Z"),
  model("helmet.stl", "cosplay", 300, "2026-07-02T00:00:00.000Z"),
  model("visor.3mf", "cosplay/helmet", 200, "2026-07-04T00:00:00.000Z"),
  model("tree.stl", "terrain/forest", 400, "2026-07-03T00:00:00.000Z")
];

describe("filterModels", () => {
  it("returns every model in the All view when includeSubfolders is enabled", () => {
    expect(filterModels(models, ALL_FOLDERS_ID, true, "")).toHaveLength(4);
  });

  it("returns only root files in the All view when includeSubfolders is disabled", () => {
    const result = filterModels(models, ALL_FOLDERS_ID, false, "");

    expect(result.map((modelFile) => modelFile.name)).toEqual(["root.stl"]);
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

  it("filters models by file type", () => {
    const result = filterModels(models, ALL_FOLDERS_ID, true, "", { type: ".3mf" });

    expect(result.map((modelFile) => modelFile.name)).toEqual(["visor.3mf"]);
  });

  it("sorts models by newest modification date first", () => {
    const result = filterModels(models, ALL_FOLDERS_ID, true, "", { sort: "modified" });

    expect(result.map((modelFile) => modelFile.name)).toEqual([
      "visor.3mf",
      "tree.stl",
      "helmet.stl",
      "root.stl"
    ]);
  });

  it("can show only selected models", () => {
    const result = filterModels(models, ALL_FOLDERS_ID, true, "", {
      onlySelected: true,
      selectedIds: new Set(["/root.stl", "cosplay/helmet/visor.3mf"])
    });

    expect(result.map((modelFile) => modelFile.name)).toEqual(["root.stl", "visor.3mf"]);
  });

  it("can show only duplicate models", () => {
    const result = filterModels(models, ALL_FOLDERS_ID, true, "", {
      onlyDuplicates: true,
      duplicateIds: new Set(["cosplay/helmet.stl", "terrain/forest/tree.stl"])
    });

    expect(result.map((modelFile) => modelFile.name)).toEqual(["helmet.stl", "tree.stl"]);
  });

  it("can show only favorite models", () => {
    const result = filterModels(models, ALL_FOLDERS_ID, true, "", {
      onlyFavorites: true,
      metadataByPath: {
        "C:/library//root.stl": { favorite: true, tags: [], notes: "" },
        "C:/library/cosplay/helmet.stl": { favorite: false, tags: [], notes: "" }
      }
    });

    expect(result.map((modelFile) => modelFile.name)).toEqual(["root.stl"]);
  });

  it("requires every selected tag to match", () => {
    const result = filterModels(models, ALL_FOLDERS_ID, true, "", {
      selectedTags: ["cosplay", "helmet"],
      metadataByPath: {
        "C:/library/cosplay/helmet.stl": {
          favorite: false,
          tags: ["cosplay", "helmet"],
          notes: ""
        },
        "C:/library/cosplay/helmet/visor.3mf": {
          favorite: false,
          tags: ["cosplay"],
          notes: ""
        }
      }
    });

    expect(result.map((modelFile) => modelFile.name)).toEqual(["helmet.stl"]);
  });

  it("matches search queries against tags", () => {
    const result = filterModels(models, ALL_FOLDERS_ID, true, "fixture", {
      metadataByPath: {
        "C:/library/terrain/forest/tree.stl": {
          favorite: false,
          tags: ["fixture"],
          notes: ""
        }
      }
    });

    expect(result.map((modelFile) => modelFile.name)).toEqual(["tree.stl"]);
  });
});

function model(
  name: string,
  relativeFolder: string,
  sizeBytes: number,
  modifiedAt: string
): ModelFile {
  return {
    id: `${relativeFolder}/${name}`,
    name,
    extension: name.endsWith(".3mf") ? ".3mf" : ".stl",
    absolutePath: `C:/library/${relativeFolder}/${name}`,
    relativeFolder,
    sizeBytes,
    modifiedAt,
    dimensionsMm: null,
    objectCount: null,
    previewError: null
  };
}
