import { XMLParser } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate";
import * as THREE from "three";

type ThreeMfVertex = {
  x: number;
  y: number;
  z: number;
};

type ThreeMfTriangle = {
  v1: number;
  v2: number;
  v3: number;
};

export function parseThreeMfPreview(buffer: ArrayBuffer): THREE.Group {
  const files = unzipSync(new Uint8Array(buffer));
  const modelFiles = Object.entries(files).filter(([filePath]) =>
    isRenderableModelPath(filePath)
  );

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ""
  });
  const group = new THREE.Group();

  for (const [, modelFile] of modelFiles) {
    const parsed = parser.parse(strFromU8(modelFile));
    const objects = toArray(parsed?.model?.resources?.object);

    for (const objectItem of objects) {
      const mesh = objectItem?.mesh;

      if (!mesh) {
        continue;
      }

      const vertices = toArray(mesh?.vertices?.vertex).map((vertex) => ({
        x: Number(vertex.x),
        y: Number(vertex.y),
        z: Number(vertex.z)
      }));
      const triangles = toArray(mesh?.triangles?.triangle).map((triangle) => ({
        v1: Number(triangle.v1),
        v2: Number(triangle.v2),
        v3: Number(triangle.v3)
      }));
      const geometry = buildGeometry(vertices, triangles);

      if (!geometry) {
        continue;
      }

      group.add(
        new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: "#78aaa6",
            roughness: 0.62,
            metalness: 0.08
          })
        )
      );
    }
  }

  if (group.children.length === 0) {
    throw new Error("3MF sem malhas renderizáveis.");
  }

  centerObject(group);
  return group;
}

function isRenderableModelPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  return normalized.startsWith("3d/") && normalized.endsWith(".model") && !normalized.includes("_rels/");
}

function buildGeometry(vertices: ThreeMfVertex[], triangles: ThreeMfTriangle[]) {
  const positions: number[] = [];

  for (const triangle of triangles) {
    const a = vertices[triangle.v1];
    const b = vertices[triangle.v2];
    const c = vertices[triangle.v3];

    if (!isValidVertex(a) || !isValidVertex(b) || !isValidVertex(c)) {
      continue;
    }

    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }

  if (positions.length === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.center();
  return geometry;
}

function isValidVertex(vertex: ThreeMfVertex | undefined): vertex is ThreeMfVertex {
  return Boolean(
    vertex &&
      Number.isFinite(vertex.x) &&
      Number.isFinite(vertex.y) &&
      Number.isFinite(vertex.z)
  );
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function centerObject(object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  box.getCenter(center);
  object.position.sub(center);
}
