import { describe, expect, it } from "vitest";
import {
  SUPPORTED_FILE_EXTENSIONS,
  canSendToSlicer,
  getFileCategory,
  is3dPreviewable,
  isArchive,
  isDirectImage
} from "../../src/shared/fileCapabilities";

describe("fileCapabilities", () => {
  it("maps every supported extension to its library category", () => {
    expect(SUPPORTED_FILE_EXTENSIONS).toEqual([
      ".stl",
      ".3mf",
      ".obj",
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".zip",
      ".rar",
      ".7z"
    ]);
    expect(getFileCategory(".stl")).toBe("model");
    expect(getFileCategory(".3mf")).toBe("model");
    expect(getFileCategory(".obj")).toBe("model");
    expect(getFileCategory(".png")).toBe("image");
    expect(getFileCategory(".jpg")).toBe("image");
    expect(getFileCategory(".jpeg")).toBe("image");
    expect(getFileCategory(".webp")).toBe("image");
    expect(getFileCategory(".zip")).toBe("archive");
    expect(getFileCategory(".rar")).toBe("archive");
    expect(getFileCategory(".7z")).toBe("archive");
  });

  it("identifies extensions with direct 3D previews", () => {
    expect(is3dPreviewable(".stl")).toBe(true);
    expect(is3dPreviewable(".3mf")).toBe(true);
    expect(is3dPreviewable(".obj")).toBe(true);
    expect(is3dPreviewable(".png")).toBe(false);
  });

  it("identifies direct images and archives", () => {
    expect(isDirectImage(".webp")).toBe(true);
    expect(isDirectImage(".obj")).toBe(false);
    expect(isArchive(".rar")).toBe(true);
    expect(isArchive(".jpeg")).toBe(false);
  });

  it("limits slicer handoff to STL and 3MF", () => {
    expect(canSendToSlicer(".stl")).toBe(true);
    expect(canSendToSlicer(".3mf")).toBe(true);
    expect(canSendToSlicer(".obj")).toBe(false);
    expect(canSendToSlicer(".png")).toBe(false);
  });
});
