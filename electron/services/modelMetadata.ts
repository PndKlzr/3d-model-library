import { readFile } from "node:fs/promises";
import path from "node:path";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate";
import type { ModelFile } from "../../src/shared/types.js";

type Vertex = { x: number; y: number; z: number };

export async function readModelMetadata(filePath: string): Promise<{
  dimensionsMm: ModelFile["dimensionsMm"];
  objectCount: number | null;
  previewError: string | null;
}> {
  try {
    const extension = path.extname(filePath).toLowerCase();
    const buffer = await readFile(filePath);

    if (extension === ".stl") {
      return readStlMetadata(buffer);
    }

    if (extension === ".3mf") {
      return read3mfMetadata(buffer);
    }

    return {
      dimensionsMm: null,
      objectCount: null,
      previewError: `Unsupported model extension: ${extension}`
    };
  } catch (error) {
    return {
      dimensionsMm: null,
      objectCount: null,
      previewError: error instanceof Error ? error.message : String(error)
    };
  }
}

function readStlMetadata(buffer: Buffer) {
  const vertices = isBinaryStl(buffer) ? parseBinaryStlVertices(buffer) : parseAsciiStlVertices(buffer);

  if (vertices.length === 0) {
    return {
      dimensionsMm: null,
      objectCount: null,
      previewError: "STL file does not contain readable vertex data"
    };
  }

  return {
    dimensionsMm: dimensionsFromVertices(vertices),
    objectCount: 1,
    previewError: null
  };
}

function isBinaryStl(buffer: Buffer): boolean {
  if (buffer.length < 84) {
    return false;
  }

  const triangleCount = buffer.readUInt32LE(80);
  return 84 + triangleCount * 50 === buffer.length;
}

function parseBinaryStlVertices(buffer: Buffer): Vertex[] {
  const triangleCount = buffer.readUInt32LE(80);
  const vertices: Vertex[] = [];
  let offset = 84;

  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    offset += 12;

    for (let vertexIndex = 0; vertexIndex < 3; vertexIndex += 1) {
      vertices.push({
        x: buffer.readFloatLE(offset),
        y: buffer.readFloatLE(offset + 4),
        z: buffer.readFloatLE(offset + 8)
      });
      offset += 12;
    }

    offset += 2;
  }

  return vertices;
}

function parseAsciiStlVertices(buffer: Buffer): Vertex[] {
  const text = buffer.toString("utf8");
  const vertices: Vertex[] = [];
  const vertexPattern =
    /vertex\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)/gi;

  for (const match of text.matchAll(vertexPattern)) {
    vertices.push({
      x: Number(match[1]),
      y: Number(match[2]),
      z: Number(match[3])
    });
  }

  return vertices.filter((vertex) =>
    Number.isFinite(vertex.x) && Number.isFinite(vertex.y) && Number.isFinite(vertex.z)
  );
}

function read3mfMetadata(buffer: Buffer) {
  try {
    const files = unzipSync(new Uint8Array(buffer));
    const modelFile = files["3D/3dmodel.model"];

    if (!modelFile) {
      return {
        dimensionsMm: null,
        objectCount: null,
        previewError: "3MF file is missing 3D/3dmodel.model"
      };
    }

    const modelXml = strFromU8(modelFile);
    if (XMLValidator.validate(modelXml) !== true) {
      throw new Error("Invalid 3MF XML");
    }

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: ""
    });
    const parsed = parser.parse(modelXml);
    const resources = parsed?.model?.resources;
    const objects = toArray(resources?.object);
    const vertices = objects.flatMap((objectItem) =>
      toArray(objectItem?.mesh?.vertices?.vertex).map((vertex) => ({
        x: Number(vertex.x),
        y: Number(vertex.y),
        z: Number(vertex.z)
      }))
    );
    const finiteVertices = vertices.filter((vertex) =>
      Number.isFinite(vertex.x) && Number.isFinite(vertex.y) && Number.isFinite(vertex.z)
    );

    return {
      dimensionsMm: finiteVertices.length > 0 ? dimensionsFromVertices(finiteVertices) : null,
      objectCount: objects.length,
      previewError: null
    };
  } catch (error) {
    return {
      dimensionsMm: null,
      objectCount: null,
      previewError: `3MF file could not be parsed: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function dimensionsFromVertices(vertices: Vertex[]): ModelFile["dimensionsMm"] {
  const bounds = vertices.reduce(
    (current, vertex) => ({
      minX: Math.min(current.minX, vertex.x),
      maxX: Math.max(current.maxX, vertex.x),
      minY: Math.min(current.minY, vertex.y),
      maxY: Math.max(current.maxY, vertex.y),
      minZ: Math.min(current.minZ, vertex.z),
      maxZ: Math.max(current.maxZ, vertex.z)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY
    }
  );

  return {
    x: roundDimension(bounds.maxX - bounds.minX),
    y: roundDimension(bounds.maxY - bounds.minY),
    z: roundDimension(bounds.maxZ - bounds.minZ)
  };
}

function roundDimension(value: number): number {
  return Math.round(value * 1000) / 1000;
}
