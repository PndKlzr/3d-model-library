import { describe, expect, it } from "vitest";
import { getDuplicateModelIds } from "../../src/lib/duplicateModels";
import type { ModelFile } from "../../src/shared/types";

describe("getDuplicateModelIds", () => {
  it("marks models with the same normalized name and size as duplicates", () => {
    const duplicateIds = getDuplicateModelIds([
      model("benchy.stl", "a", 100),
      model("BENCHY.3mf", "b", 100),
      model("benchy.stl", "c", 200),
      model("cube.stl", "d", 100)
    ]);

    expect([...duplicateIds].sort()).toEqual(["a/benchy.stl", "b/BENCHY.3mf"]);
  });
});

function model(name: string, relativeFolder: string, sizeBytes: number): ModelFile {
  return {
    id: `${relativeFolder}/${name}`,
    name,
    extension: name.endsWith(".3mf") ? ".3mf" : ".stl",
    absolutePath: `C:/library/${relativeFolder}/${name}`,
    relativeFolder,
    sizeBytes,
    modifiedAt: "2026-07-04T00:00:00.000Z",
    dimensionsMm: null,
    objectCount: null,
    previewError: null
  };
}
