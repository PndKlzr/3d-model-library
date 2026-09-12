import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import {
  mapOrderedTrianglesToGroups,
  parseObjPreview
} from "../../src/lib/objPreview";
import {
  OBJ_PREVIEW_BUDGET,
  OBJ_PREVIEW_LIMIT_ERROR
} from "../../src/shared/objPreviewBudget";

const OBJ_ERROR = "Não foi possível carregar o OBJ.";

describe("parseObjPreview", () => {
  it("parses non-empty OBJ geometry from UTF-8 bytes", () => {
    const object = parseObjPreview(objBytes([
      "o triangle",
      "v 0 0 0",
      "v 20 0 0",
      "v 0 20 0",
      "f 1 2 3"
    ]));

    expect(new THREE.Box3().setFromObject(object).isEmpty()).toBe(false);
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        expect(child.material).toBeInstanceOf(THREE.MeshStandardMaterial);
      }
    });
  });

  it("preserves UTF-8 object names and separate OBJ groups", () => {
    const object = parseObjPreview(objBytes([
      "o peça esquerda",
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "f 1 2 3",
      "g encaixe direito",
      "v 10 0 0",
      "v 11 0 0",
      "v 10 1 0",
      "f 4 5 6"
    ]));
    const meshes = collectMeshes(object);

    expect(meshes).toHaveLength(2);
    expect(meshes.map((mesh) => mesh.name)).toEqual(["peça esquerda", "encaixe direito"]);
  });

  it("computes absent normals and applies one neutral shadow-ready material per mesh", () => {
    const object = parseObjPreview(objBytes([
      "o triangle",
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "f 1 2 3"
    ]));
    const [mesh] = collectMeshes(object);
    const material = mesh.material as THREE.MeshStandardMaterial;

    expect(mesh.geometry.getAttribute("normal")).toBeDefined();
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(material.color.getHexString()).toBe("78aaa6");
    expect(material.roughness).toBeCloseTo(0.62);
    expect(material.metalness).toBeCloseTo(0.08);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
  });

  it("disposes imported OBJ materials when replacing them", () => {
    const dispose = vi.spyOn(THREE.Material.prototype, "dispose");

    parseObjPreview(objBytes([
      "o painted",
      "usemtl exterior",
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "f 1 2 3"
    ]));

    expect(dispose).toHaveBeenCalled();
  });

  it("keeps face meshes and removes line and point renderables", () => {
    const disposeGeometry = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
    const object = parseObjPreview(objBytes([
      "o mixed",
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "f 1 2 3",
      "o wire",
      "l 1 2",
      "o marker",
      "p 3"
    ]));
    const unwanted: THREE.Object3D[] = [];
    object.traverse((child) => {
      if (child instanceof THREE.Line || child instanceof THREE.Points) unwanted.push(child);
    });

    expect(collectMeshes(object)).toHaveLength(1);
    expect(unwanted).toHaveLength(0);
    expect(disposeGeometry).toHaveBeenCalled();
  });

  it("does not dispose resources shared by a retained mesh before material replacement", () => {
    const geometry = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
    );
    const texture = new THREE.Texture();
    const importedMaterial = new THREE.MeshBasicMaterial({ map: texture });
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(importedMaterial, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");
    const parsed = new THREE.Group();
    parsed.add(
      new THREE.Mesh(geometry, importedMaterial),
      new THREE.LineSegments(geometry, importedMaterial)
    );
    const loaderParse = vi.spyOn(OBJLoader.prototype, "parse").mockReturnValueOnce(parsed);

    const object = parseObjPreview(objBytes([
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "f 1 2 3"
    ]));

    expect(collectMeshes(object)).toHaveLength(1);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    loaderParse.mockRestore();
  });

  it("rejects an OBJ containing only zero-area faces", () => {
    expect(() => parseObjPreview(objBytes([
      "o collapsed",
      "v 1 1 1",
      "f 1 1 1"
    ]))).toThrow(OBJ_ERROR);
  });

  it("drops a degenerate mesh while preserving valid sibling groups", () => {
    const object = parseObjPreview(objBytes([
      "o valid",
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "f 1 2 3",
      "o collapsed",
      "v 5 5 5",
      "f 4 4 4"
    ]));

    expect(collectMeshes(object).map((mesh) => mesh.name)).toEqual(["valid"]);
  });

  it("keeps a very small triangle when its area is non-zero", () => {
    const object = parseObjPreview(objBytes([
      "o tiny",
      "v 0 0 0",
      "v 0.00001 0 0",
      "v 0 0.00001 0",
      "f 1 2 3"
    ]));

    expect(collectMeshes(object).map((mesh) => mesh.name)).toEqual(["tiny"]);
  });

  it("removes only the degenerate triangle from non-indexed geometry", () => {
    const geometry = mixedTriangleGeometry(false);
    const parsed = new THREE.Group();
    parsed.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    const loaderParse = vi.spyOn(OBJLoader.prototype, "parse").mockReturnValueOnce(parsed);

    const object = parseObjPreview(objBytes(["f 1 2 3"]));
    const [mesh] = collectMeshes(object);

    expect(mesh.geometry.getIndex()).toBeNull();
    expect(mesh.geometry.getAttribute("position").count).toBe(3);
    expect(mesh.geometry.getAttribute("normal").count).toBe(3);
    expect(mesh.geometry.getAttribute("uv").count).toBe(3);
    expect(triangleAreas(mesh.geometry)).toEqual([0.5]);
    loaderParse.mockRestore();
  });

  it("removes only the degenerate triangle from indexed geometry", () => {
    const geometry = mixedTriangleGeometry(true);
    const parsed = new THREE.Group();
    parsed.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    const loaderParse = vi.spyOn(OBJLoader.prototype, "parse").mockReturnValueOnce(parsed);

    const object = parseObjPreview(objBytes(["f 1 2 3"]));
    const [mesh] = collectMeshes(object);

    expect(mesh.geometry.getIndex()?.count).toBe(3);
    expect(mesh.geometry.getAttribute("position").count).toBe(4);
    expect(mesh.geometry.getAttribute("normal").count).toBe(4);
    expect(mesh.geometry.getAttribute("uv").count).toBe(4);
    expect(triangleAreas(mesh.geometry)).toEqual([0.5]);
    loaderParse.mockRestore();
  });

  it("rebuilds indexed material groups around degenerates at the beginning, middle, and end", () => {
    const geometry = groupedTriangleGeometry(true);
    const parsed = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, [
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial()
    ]);
    const externalGroup = new THREE.Group();
    externalGroup.name = "external assembly";
    externalGroup.add(mesh);
    parsed.add(externalGroup);
    const loaderParse = vi.spyOn(OBJLoader.prototype, "parse").mockReturnValueOnce(parsed);

    const object = parseObjPreview(objBytes(["f 1 2 3"]));
    const [result] = collectMeshes(object);

    expect(result.geometry.getIndex()?.count).toBe(9);
    expect(triangleAreas(result.geometry)).toEqual([0.5, 0.5, 0.5]);
    expect(result.geometry.groups).toEqual([
      { start: 0, count: 6, materialIndex: 1 },
      { start: 6, count: 3, materialIndex: 2 }
    ]);
    expect(result.parent?.name).toBe("external assembly");
    loaderParse.mockRestore();
  });

  it("rebuilds non-indexed material groups around degenerates at the beginning, middle, and end", () => {
    const geometry = groupedTriangleGeometry(false);
    const parsed = new THREE.Group();
    parsed.add(new THREE.Mesh(geometry, [
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial()
    ]));
    const loaderParse = vi.spyOn(OBJLoader.prototype, "parse").mockReturnValueOnce(parsed);

    const object = parseObjPreview(objBytes(["f 1 2 3"]));
    const [result] = collectMeshes(object);

    expect(result.geometry.getIndex()).toBeNull();
    expect(result.geometry.getAttribute("position").count).toBe(9);
    expect(triangleAreas(result.geometry)).toEqual([0.5, 0.5, 0.5]);
    expect(result.geometry.groups).toEqual([
      { start: 0, count: 6, materialIndex: 1 },
      { start: 6, count: 3, materialIndex: 2 }
    ]);
    loaderParse.mockRestore();
  });

  it("maps many ordered groups with linear property access", () => {
    let propertyReads = 0;
    const groupCount = 2_000;
    const groups = Array.from({ length: groupCount }, (_, key) => ({
      get start() { propertyReads += 1; return key * 3; },
      get count() { propertyReads += 1; return 3; },
      get materialIndex() { propertyReads += 1; return key % 4; },
      key
    }));
    const offsets = Array.from({ length: groupCount }, (_, index) => index * 3);

    const assignments = mapOrderedTrianglesToGroups(groups, offsets);

    expect(assignments).toHaveLength(groupCount);
    expect(assignments[0]).toEqual({ key: 0, materialIndex: 0 });
    expect(assignments.at(-1)).toEqual({ key: groupCount - 1, materialIndex: 3 });
    expect(propertyReads).toBeLessThanOrEqual(groupCount * 8);
  });

  it("handles ordered overlaps, gaps, and ungrouped triangles deterministically", () => {
    const assignments = mapOrderedTrianglesToGroups([
      { start: 0, count: 9, materialIndex: 4, key: 0 },
      { start: 3, count: 9, materialIndex: 7, key: 1 },
      { start: 15, count: 3, materialIndex: 9, key: 2 }
    ], [0, 3, 6, 9, 12, 15, 18]);

    expect(assignments).toEqual([
      { key: 0, materialIndex: 4 },
      { key: 0, materialIndex: 4 },
      { key: 0, materialIndex: 4 },
      { key: 1, materialIndex: 7 },
      null,
      { key: 2, materialIndex: 9 },
      null
    ]);
  });

  it("reads a future group only once while crossing a large gap", () => {
    let propertyReads = 0;
    const futureGroup = {
      get start() { propertyReads += 1; return 30_000; },
      get count() { propertyReads += 1; return 3; },
      get materialIndex() { propertyReads += 1; return 6; },
      get key() { propertyReads += 1; return 1; }
    };
    const offsets = Array.from({ length: 10_001 }, (_, index) => index * 3);

    const assignments = mapOrderedTrianglesToGroups([futureGroup], offsets);

    expect(assignments.slice(0, -1).every((assignment) => assignment === null)).toBe(true);
    expect(assignments.at(-1)).toEqual({ key: 1, materialIndex: 6 });
    expect(propertyReads).toBe(4);
  });

  it("rejects source bytes above the centralized budget before decoding", () => {
    expect(OBJ_PREVIEW_BUDGET.maxSourceBytes).toBe(64 * 1024 * 1024);
    expect(() => parseObjPreview(
      new ArrayBuffer(OBJ_PREVIEW_BUDGET.maxSourceBytes + 1)
    )).toThrow(OBJ_PREVIEW_LIMIT_ERROR);
  });

  it("rejects excessive textual complexity before OBJLoader parsing", () => {
    const parse = vi.spyOn(OBJLoader.prototype, "parse");
    const excessiveLines = new TextEncoder().encode(
      "\n".repeat(OBJ_PREVIEW_BUDGET.maxLines + 1)
    ).buffer;

    expect(() => parseObjPreview(excessiveLines)).toThrow(OBJ_PREVIEW_LIMIT_ERROR);
    expect(parse).not.toHaveBeenCalled();
  });

  it.each([
    ["empty input", []],
    ["vertices without faces", ["v 0 0 0", "v 1 0 0", "v 0 1 0"]],
    ["malformed faces", ["v 0 0 0", "v 1 0 0", "v 0 1 0", "f 1 2 nope"]]
  ])("rejects %s with a stable error", (_label, lines) => {
    expect(() => parseObjPreview(objBytes(lines))).toThrow(OBJ_ERROR);
  });
});

function objBytes(lines: string[]) {
  return new TextEncoder().encode(lines.join("\n")).buffer;
}

function collectMeshes(object: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  return meshes;
}

function mixedTriangleGeometry(indexed: boolean) {
  const positions = indexed
    ? [0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 2, 2]
    : [0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2];
  const vertexCount = positions.length / 3;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(vertexCount * 3).fill(1), 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Array(vertexCount * 2).fill(0.5), 2));
  if (indexed) geometry.setIndex([0, 1, 2, 3, 3, 3]);
  return geometry;
}

function groupedTriangleGeometry(indexed: boolean) {
  const triangles = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 0, 1, 0],
    [2, 2, 2, 2, 2, 2, 2, 2, 2],
    [2, 0, 0, 3, 0, 0, 2, 1, 0],
    [4, 0, 0, 5, 0, 0, 4, 1, 0],
    [6, 6, 6, 6, 6, 6, 6, 6, 6]
  ];
  const geometry = new THREE.BufferGeometry();

  if (indexed) {
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(triangles.flat(), 3)
    );
    geometry.setIndex(Array.from({ length: triangles.length * 3 }, (_, index) => index));
  } else {
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(triangles.flat(), 3)
    );
  }

  geometry.addGroup(0, 3, 0);
  geometry.addGroup(3, 9, 1);
  geometry.addGroup(12, 6, 2);
  return geometry;
}

function triangleAreas(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const count = index?.count ?? position.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const areas: number[] = [];
  for (let offset = 0; offset + 2 < count; offset += 3) {
    a.fromBufferAttribute(position, index ? index.getX(offset) : offset);
    b.fromBufferAttribute(position, index ? index.getX(offset + 1) : offset + 1);
    c.fromBufferAttribute(position, index ? index.getX(offset + 2) : offset + 2);
    areas.push(cross.crossVectors(b.sub(a), c.sub(a)).length() / 2);
  }
  return areas;
}
