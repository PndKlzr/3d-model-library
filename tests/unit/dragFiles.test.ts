import { describe, expect, it } from "vitest";
import { getDragModelIds, getDragOutFilePaths } from "../../src/lib/dragFiles";
import type { ModelFile } from "../../src/shared/types";

describe("dragFiles", () => {
  const models: ModelFile[] = [
    createModel("a", "part-a.stl", ".stl", "C:\\library\\part-a.stl"),
    createModel("b", "part-b.3mf", ".3mf", "C:\\library\\part-b.3mf"),
    createModel("c", "pack.zip", ".zip", "C:\\library\\pack.zip")
  ];

  it("drags all supported selected files when the dragged model is selected", () => {
    const paths = getDragOutFilePaths(models[0], models, new Set(["a", "b", "c"]));

    expect(paths).toEqual([
      "C:\\library\\part-a.stl",
      "C:\\library\\part-b.3mf",
      "C:\\library\\pack.zip"
    ]);
  });

  it("drags only the current supported file when it is not part of the selection", () => {
    const paths = getDragOutFilePaths(models[1], models, new Set(["a"]));

    expect(paths).toEqual(["C:\\library\\part-b.3mf"]);
  });

  it("drags archives for external Explorer or desktop drops", () => {
    const paths = getDragOutFilePaths(models[2], models, new Set(["c"]));

    expect(paths).toEqual(["C:\\library\\pack.zip"]);
  });

  it("keeps selected models from the whole library even when a filtered view is showing", () => {
    expect(getDragModelIds(models[0], models, new Set(["a", "c"]))).toEqual(["a", "c"]);
  });

  it("uses only the dragged model when it is outside the current selection", () => {
    expect(getDragModelIds(models[1], models, new Set(["a", "c"]))).toEqual(["b"]);
  });

  it("deduplicates paths case-insensitively for Windows native drag", () => {
    const duplicate = createModel("d", "PART-A.STL", ".stl", "c:\\LIBRARY\\PART-A.STL");

    expect(getDragOutFilePaths(models[0], [...models, duplicate], new Set(["a", "d"]))).toEqual([
      "C:\\library\\part-a.stl"
    ]);
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
