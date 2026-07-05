import { describe, expect, it } from "vitest";
import { getDragOutFilePaths } from "../../src/lib/dragFiles";
import type { ModelFile } from "../../src/shared/types";

describe("dragFiles", () => {
  const models: ModelFile[] = [
    createModel("a", "part-a.stl", ".stl", "C:\\library\\part-a.stl"),
    createModel("b", "part-b.3mf", ".3mf", "C:\\library\\part-b.3mf"),
    createModel("c", "pack.zip", ".zip", "C:\\library\\pack.zip")
  ];

  it("drags all printable selected files when the dragged model is selected", () => {
    const paths = getDragOutFilePaths(models[0], models, new Set(["a", "b", "c"]));

    expect(paths).toEqual(["C:\\library\\part-a.stl", "C:\\library\\part-b.3mf"]);
  });

  it("drags only the current printable file when it is not part of the selection", () => {
    const paths = getDragOutFilePaths(models[1], models, new Set(["a"]));

    expect(paths).toEqual(["C:\\library\\part-b.3mf"]);
  });

  it("does not drag archives out to slicers", () => {
    const paths = getDragOutFilePaths(models[2], models, new Set(["c"]));

    expect(paths).toEqual([]);
  });
});

function createModel(
  id: string,
  name: string,
  extension: ModelFile["extension"],
  absolutePath: string
): ModelFile {
  return {
    id,
    name,
    extension,
    absolutePath,
    relativeFolder: "",
    sizeBytes: 100,
    modifiedAt: "2026-07-05T00:00:00.000Z",
    dimensionsMm: null,
    objectCount: null,
    previewError: null
  };
}
