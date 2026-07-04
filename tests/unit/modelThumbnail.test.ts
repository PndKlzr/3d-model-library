import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { readEmbeddedThumbnail } from "../../electron/services/modelThumbnail";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "model-thumbnail-"));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("readEmbeddedThumbnail", () => {
  it("returns a data URL for embedded 3MF thumbnails", async () => {
    const filePath = path.join(tempRoot, "model.3mf");
    await writeFile(
      filePath,
      zipSync({
        "Auxiliaries/.thumbnails/thumbnail_3mf.png": new Uint8Array([1, 2, 3])
      })
    );

    await expect(readEmbeddedThumbnail(filePath)).resolves.toBe("data:image/png;base64,AQID");
  });

  it("falls back to slicer metadata preview images when no thumbnail path exists", async () => {
    const filePath = path.join(tempRoot, "metadata-preview.3mf");
    await writeFile(
      filePath,
      zipSync({
        "Metadata/plate_1.png": new Uint8Array([1, 2, 3]),
        "Metadata/plate_1_small.png": new Uint8Array([4, 5, 6]),
        "Metadata/pick_1.png": new Uint8Array([7, 8, 9])
      })
    );

    await expect(readEmbeddedThumbnail(filePath)).resolves.toBe("data:image/png;base64,BAUG");
  });

  it("returns null for STL files", async () => {
    const filePath = path.join(tempRoot, "model.stl");
    await writeFile(filePath, "solid model\nendsolid model");

    await expect(readEmbeddedThumbnail(filePath)).resolves.toBeNull();
  });
});
