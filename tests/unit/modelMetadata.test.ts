import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readModelMetadata } from "../../electron/services/modelMetadata";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "model-metadata-"));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("readModelMetadata", () => {
  it("calculates dimensions from ASCII STL vertices", async () => {
    const filePath = path.join(tempRoot, "ascii.stl");
    await writeFile(
      filePath,
      `solid cube
facet normal 0 0 1
outer loop
vertex -1 0 2
vertex 3 0 2
vertex -1 5 8
endloop
endfacet
endsolid cube`
    );

    const metadata = await readModelMetadata(filePath);

    expect(metadata).toEqual({
      dimensionsMm: { x: 4, y: 5, z: 6 },
      objectCount: 1,
      previewError: null
    });
  });

  it("calculates dimensions from binary STL vertices", async () => {
    const filePath = path.join(tempRoot, "binary.stl");
    await writeFile(filePath, createBinaryStl([
      [-2, 1, 0],
      [4, 6, 10],
      [1, -3, 5]
    ]));

    const metadata = await readModelMetadata(filePath);

    expect(metadata).toEqual({
      dimensionsMm: { x: 6, y: 9, z: 10 },
      objectCount: 1,
      previewError: null
    });
  });

  it("returns a readable preview error for corrupt STL files", async () => {
    const filePath = path.join(tempRoot, "bad.stl");
    await writeFile(filePath, "not enough vertex data");

    const metadata = await readModelMetadata(filePath);

    expect(metadata.dimensionsMm).toBeNull();
    expect(metadata.objectCount).toBeNull();
    expect(metadata.previewError).toContain("STL");
  });

  it("counts objects and dimensions from a minimal 3MF file", async () => {
    const filePath = path.join(tempRoot, "model.3mf");
    const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0" />
          <vertex x="10" y="5" z="2" />
          <vertex x="4" y="9" z="8" />
        </vertices>
      </mesh>
    </object>
    <object id="2" type="model" />
  </resources>
</model>`;
    const zipped = zipSync({
      "3D/3dmodel.model": strToU8(modelXml)
    });
    await writeFile(filePath, zipped);

    const metadata = await readModelMetadata(filePath);

    expect(metadata).toEqual({
      dimensionsMm: { x: 10, y: 9, z: 8 },
      objectCount: 2,
      previewError: null
    });
  });

  it("returns a readable error for malformed 3MF XML", async () => {
    const filePath = path.join(tempRoot, "malformed.3mf");
    await writeFile(filePath, zipSync({
      "3D/3dmodel.model": strToU8(
        '<model><resources><object id="1"><mesh></object></resources></model>'
      )
    }));

    const metadata = await readModelMetadata(filePath);

    expect(metadata.dimensionsMm).toBeNull();
    expect(metadata.objectCount).toBeNull();
    expect(metadata.previewError).toContain("3MF file could not be parsed");
  });
});

function createBinaryStl(vertices: Array<[number, number, number]>): Buffer {
  const triangleCount = 1;
  const buffer = Buffer.alloc(84 + triangleCount * 50);
  buffer.writeUInt32LE(triangleCount, 80);

  let offset = 84;
  offset += 12;

  for (const vertex of vertices) {
    buffer.writeFloatLE(vertex[0], offset);
    buffer.writeFloatLE(vertex[1], offset + 4);
    buffer.writeFloatLE(vertex[2], offset + 8);
    offset += 12;
  }

  buffer.writeUInt16LE(0, offset);
  return buffer;
}
