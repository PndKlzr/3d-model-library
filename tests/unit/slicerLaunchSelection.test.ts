import { describe, expect, it } from "vitest";
import { getSlicerLaunchFilePaths } from "../../src/lib/slicerLaunchSelection";
import type { ModelFile } from "../../src/shared/types";

describe("getSlicerLaunchFilePaths", () => {
  it("keeps only slicer-capable files from a mixed selection", () => {
    const files = [
      model("part.stl", ".stl"),
      model("project.3mf", ".3mf"),
      model("mesh.obj", ".obj"),
      model("photo.png", ".png"),
      model("pack.zip", ".zip")
    ];

    expect(getSlicerLaunchFilePaths(files[0], files, new Set(files.map((file) => file.id))))
      .toEqual([files[0].absolutePath, files[1].absolutePath]);
  });

  it("returns no path when the context file is incapable and is not part of a printable selection", () => {
    const obj = model("mesh.obj", ".obj");
    expect(getSlicerLaunchFilePaths(obj, [obj], new Set([obj.id]))).toEqual([]);
  });
});

function model(name: string, extension: ModelFile["extension"]): ModelFile {
  return {
    id: name,
    name,
    extension,
    absolutePath: `C:\\Models\\${name}`,
    relativeFolder: "",
    sizeBytes: 10,
    modifiedAt: "2026-09-12T00:00:00.000Z",
    dimensionsMm: null,
    objectCount: null,
    previewError: null
  };
}
