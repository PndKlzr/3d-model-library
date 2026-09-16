import { describe, expect, it } from "vitest";
import type { ModelFile } from "../../src/shared/types";
import {
  ALL_FOLDERS_ID,
  filterModels,
  getFolderScopeModels,
  isFolderExcluded,
  reconcileExcludedFolders
} from "../../src/lib/folderFilters";

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
    const result = filterModels(models, ALL_FOLDERS_ID, true, "", {
      visibleExtensions: new Set([".3mf"])
    });

    expect(result.map((modelFile) => modelFile.name)).toEqual(["visor.3mf"]);
  });

  it("combines visible extensions and excluded folders with the other filters", () => {
    const files = [
      ...models,
      model("reference.obj", "cosplay", 250, "2026-07-05T00:00:00.000Z", ".obj"),
      model("preview.png", "cosplay", 150, "2026-07-06T00:00:00.000Z", ".png"),
      model("keep.obj", "parts-old", 175, "2026-07-07T00:00:00.000Z", ".obj")
    ];

    const result = filterModels(files, ALL_FOLDERS_ID, true, "obj", {
      visibleExtensions: new Set([".obj", ".png"]),
      excludedFolders: ["cosplay"]
    });

    expect(result.map((modelFile) => modelFile.name)).toEqual(["keep.obj"]);
  });

  it("allows every supported type to be hidden", () => {
    expect(filterModels(models, ALL_FOLDERS_ID, true, "", {
      visibleExtensions: new Set()
    })).toEqual([]);
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

  it("finds recent and never-opened models from slicer history", () => {
    const slicerHistory = [
      { modelPath: models[0].absolutePath, slicerId: "cura", openedAt: "2026-07-20T00:00:00.000Z" },
      { modelPath: models[1].absolutePath, slicerId: "cura", openedAt: "2026-05-01T00:00:00.000Z" }
    ];

    expect(filterModels(models, ALL_FOLDERS_ID, true, "", {
      usageFilter: "recent",
      slicerHistory,
      now: Date.parse("2026-08-01T00:00:00.000Z")
    }).map((item) => item.name)).toEqual(["root.stl"]);
    expect(filterModels(models, ALL_FOLDERS_ID, true, "", {
      usageFilter: "never",
      slicerHistory
    }).map((item) => item.name)).toEqual(["tree.stl", "visor.3mf"]);
  });

  it("filters and searches model notes", () => {
    const metadataByPath = {
      [models[0].absolutePath]: { favorite: false, tags: [], notes: "Ajustar suporte lateral" },
      [models[1].absolutePath]: { favorite: false, tags: [], notes: "" }
    };

    expect(filterModels(models, ALL_FOLDERS_ID, true, "", {
      notesFilter: "with-notes",
      metadataByPath
    }).map((item) => item.name)).toEqual(["root.stl"]);
    expect(filterModels(models, ALL_FOLDERS_ID, true, "suporte lateral", {
      metadataByPath
    }).map((item) => item.name)).toEqual(["root.stl"]);
  });

  it("supports all, any, and exclude tag matching", () => {
    const metadataByPath = {
      [models[0].absolutePath]: { favorite: false, tags: ["util", "rapido"], notes: "" },
      [models[1].absolutePath]: { favorite: false, tags: ["util"], notes: "" },
      [models[2].absolutePath]: { favorite: false, tags: ["decoracao"], notes: "" }
    };
    const options = { selectedTags: ["util", "rapido"], metadataByPath };

    expect(filterModels(models, ALL_FOLDERS_ID, true, "", {
      ...options,
      tagMatchMode: "all"
    }).map((item) => item.name)).toEqual(["root.stl"]);
    expect(filterModels(models, ALL_FOLDERS_ID, true, "", {
      ...options,
      tagMatchMode: "any"
    }).map((item) => item.name)).toEqual(["helmet.stl", "root.stl"]);
    expect(filterModels(models, ALL_FOLDERS_ID, true, "", {
      ...options,
      tagMatchMode: "exclude"
    }).map((item) => item.name)).toEqual(["tree.stl", "visor.3mf"]);
  });
});

describe("getFolderScopeModels", () => {
  it("returns every model for the recursive All view", () => {
    expect(getFolderScopeModels(models, ALL_FOLDERS_ID, true)).toEqual(models);
  });

  it("returns only root models for the non-recursive All view", () => {
    expect(getFolderScopeModels(models, ALL_FOLDERS_ID, false).map((item) => item.name))
      .toEqual(["root.stl"]);
  });

  it("returns a folder and its descendants when recursive", () => {
    expect(getFolderScopeModels(models, "cosplay", true).map((item) => item.name))
      .toEqual(["helmet.stl", "visor.3mf"]);
  });

  it("returns only exact folder members when non-recursive", () => {
    expect(getFolderScopeModels(models, "cosplay", false).map((item) => item.name))
      .toEqual(["helmet.stl"]);
  });
});

describe("folder exclusions", () => {
  it("matches normalized complete path segments", () => {
    expect(isFolderExcluded("parts/sub", ["parts"])).toBe(true);
    expect(isFolderExcluded("parts-old", ["parts"])).toBe(false);
    expect(isFolderExcluded("parts\\sub\\nested", ["/parts/sub/"])).toBe(true);
  });

  it("removes exclusions only when their exact folder no longer exists", () => {
    expect(reconcileExcludedFolders(
      ["parts", "parts/sub", "missing", "PARTS"],
      ["parts", "parts/sub", "parts-old"]
    )).toEqual(["parts", "parts/sub"]);
  });
});

function model(
  name: string,
  relativeFolder: string,
  sizeBytes: number,
  modifiedAt: string,
  extension: ModelFile["extension"] = name.endsWith(".3mf") ? ".3mf" : ".stl"
): ModelFile {
  return {
    id: `${relativeFolder}/${name}`,
    name,
    extension,
    absolutePath: `C:/library/${relativeFolder}/${name}`,
    relativeFolder,
    sizeBytes,
    modifiedAt,
    dimensionsMm: null,
    objectCount: null,
    previewError: null
  };
}
